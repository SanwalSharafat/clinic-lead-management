import { AvailabilityCheckResult, AlternativeSlot, BookingResult } from '../../types';

export interface CalendarProvider {
  checkAvailability(startTime: string, durationMinutes: number): Promise<AvailabilityCheckResult>;
  suggestAlternatives(startTime: string, durationMinutes: number): Promise<AlternativeSlot[]>;
  createEvent(startTime: string, endTime: string, summary: string, description?: string): Promise<BookingResult>;
}

export type { AvailabilityCheckResult, AlternativeSlot, BookingResult };
