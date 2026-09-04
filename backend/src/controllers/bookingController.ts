import { Request, Response } from 'express';
import { BookingService } from '../services/calendar';
import { bookingRequestSchema } from '../validators/schemas';

function isZodError(error: unknown): error is { issues: unknown[] } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  );
}

export class BookingController {
  private bookingService: BookingService;

  constructor(bookingService: BookingService) {
    this.bookingService = bookingService;
  }

  // POST /bookings
  async createBooking(req: Request, res: Response): Promise<void> {
    try {
      const validated = bookingRequestSchema.parse(req.body);
      const result = await this.bookingService.bookAppointment({
        patientId: validated.patient_id,
        requestedSlot: validated.requested_slot,
        durationMinutes: validated.duration_minutes,
        summary: validated.summary,
        description: validated.description,
      });
      if (result.success) {
        res.status(201).json({ success: true, data: result });
      } else {
        res.status(409).json({ success: false, error: result.error, alternatives: result.alternatives });
      }
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({ success: false, error: 'Validation error', details: error });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // GET /bookings/availability?start=ISO&duration=30
  async checkAvailability(req: Request, res: Response): Promise<void> {
    try {
      const startTime = req.query.start as string;
      const duration = parseInt(req.query.duration as string) || 30;
      if (!startTime) {
        res.status(400).json({ success: false, error: 'start query parameter is required (ISO datetime)' });
        return;
      }
      const result = await this.bookingService.checkAvailability(startTime, duration);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }
}
