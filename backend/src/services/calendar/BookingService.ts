import { CalendarProvider, AvailabilityCheckResult, AlternativeSlot, BookingResult } from './CalendarProvider';
import { PendingBookingRepository, AppointmentRepository, ErrorLogRepository, PatientRepository } from '../../repositories';
import { PatientStatus } from '../../types';

export class BookingService {
  private calendarProvider: CalendarProvider;
  private pendingBookingRepo: PendingBookingRepository;
  private appointmentRepo: AppointmentRepository;
  private errorLogRepo: ErrorLogRepository;
  private patientRepo: PatientRepository;

  constructor(
    calendarProvider: CalendarProvider,
    pendingBookingRepo: PendingBookingRepository,
    appointmentRepo: AppointmentRepository,
    errorLogRepo: ErrorLogRepository,
    patientRepo: PatientRepository,
  ) {
    this.calendarProvider = calendarProvider;
    this.pendingBookingRepo = pendingBookingRepo;
    this.appointmentRepo = appointmentRepo;
    this.errorLogRepo = errorLogRepo;
    this.patientRepo = patientRepo;
  }

  /**
   * Main booking flow with double-booking prevention.
   *
   * Sequence:
   *  1. Clean expired locks
   *  2. Acquire a DB-level lock (pending_booking row with unique constraint)
   *  3. Re-check availability (in case front-desk booked through another channel)
   *  4. Create the Google Calendar event (with retry)
   *  5. Persist the appointment record
   *  6. Update the patient status to BOOKED_VISIT
   *  7. Always release the lock in a finally block
   */
  async bookAppointment(params: {
    patientId: string;
    requestedSlot: string;
    durationMinutes: number;
    summary?: string;
    description?: string;
  }): Promise<BookingResult & { alternatives?: AlternativeSlot[] }> {
    // 1. Clean expired locks
    await this.pendingBookingRepo.cleanExpiredLocks();

    // 2. Acquire lock (pending_booking row with unique constraint on calendar_id + requested_slot)
    //    TTL = 2 minutes
    const lock = await this.pendingBookingRepo.acquireLock(
      process.env.GOOGLE_CALENDAR_CALENDAR_ID || 'primary',
      params.requestedSlot,
      params.patientId,
      2, // 2 minute TTL
    );

    if (!lock) {
      // Slot is already locked by another booking attempt
      const alternatives = await this.calendarProvider.suggestAlternatives(
        params.requestedSlot,
        params.durationMinutes,
      );
      return { success: false, error: 'Slot is being booked by another patient', alternatives };
    }

    try {
      // 3. Re-check availability (another channel like front desk may have booked it)
      const availability: AvailabilityCheckResult = await this.calendarProvider.checkAvailability(
        params.requestedSlot,
        params.durationMinutes,
      );

      if (!availability.available) {
        // Slot no longer available (booked through another channel)
        const alternatives = await this.calendarProvider.suggestAlternatives(
          params.requestedSlot,
          params.durationMinutes,
        );
        return { success: false, error: 'Slot is no longer available', alternatives };
      }

      // 4. Create the Google Calendar event (with retry)
      const endTime = new Date(
        new Date(params.requestedSlot).getTime() + params.durationMinutes * 60_000,
      ).toISOString();

      let bookingResult: BookingResult = { success: false, error: 'Unreachable' };
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        bookingResult = await this.calendarProvider.createEvent(
          params.requestedSlot,
          endTime,
          params.summary || 'Dental Appointment',
          params.description,
        );
        if (bookingResult.success) break;
        retries++;
        if (retries < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * retries)); // exponential-ish backoff
        }
      }

      if (!bookingResult.success) {
        // All retries failed
        await this.errorLogRepo.create({
          patient_id: params.patientId,
          service: 'calendar',
          operation: 'bookAppointment',
          error_message: bookingResult.error || 'Booking failed after retries',
        });
        return { success: false, error: 'Failed to create calendar event after multiple attempts' };
      }

      // 5. Create appointment record in DB
      await this.appointmentRepo.create({
        patient_id: params.patientId,
        scheduled_time: params.requestedSlot,
        calendar_event_id: bookingResult.calendar_event_id,
      });

      // 6. Update patient status
      await this.patientRepo.updateStatus(params.patientId, PatientStatus.BOOKED_VISIT);

      return { success: true, calendar_event_id: bookingResult.calendar_event_id };
    } finally {
      // 7. Always release the lock
      await this.pendingBookingRepo.releaseLock(lock.id);
    }
  }

  /**
   * Simple availability check (no lock).
   */
  async checkAvailability(
    startTime: string,
    durationMinutes: number,
  ): Promise<AvailabilityCheckResult> {
    return this.calendarProvider.checkAvailability(startTime, durationMinutes);
  }

  /**
   * Get alternatives (no lock).
   */
  async suggestAlternatives(
    startTime: string,
    durationMinutes: number,
  ): Promise<AlternativeSlot[]> {
    return this.calendarProvider.suggestAlternatives(startTime, durationMinutes);
  }
}
