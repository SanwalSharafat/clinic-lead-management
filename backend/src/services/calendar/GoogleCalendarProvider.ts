import { google } from 'googleapis';
import { GaxiosError } from 'gaxios';
import { CalendarProvider, AvailabilityCheckResult, AlternativeSlot, BookingResult } from './CalendarProvider';

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;
const MAX_ALTERNATIVES = 3;
const MAX_RETRY_ATTEMPTS = 3;

/** HTTP status codes that indicate a transient error worth retrying */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export class GoogleCalendarProvider implements CalendarProvider {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private calendarId: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '';
    this.clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '';
    this.refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ?? '';
    this.calendarId = process.env.GOOGLE_CALENDAR_CALENDAR_ID ?? 'primary';
  }

  /**
   * Creates an OAuth2 client and refreshes the access token.
   * Returns an authenticated OAuth2 client ready for API calls.
   */
  private async getAuth() {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Google Calendar credentials are not configured');
    }

    const oauth2Client = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2Client.setCredentials({
      refresh_token: this.refreshToken,
    });

    await oauth2Client.getAccessToken();
    return oauth2Client;
  }

  /**
   * Returns a ready-to-use google.calendar.v3.Calendar instance
   * with a fresh access token.
   */
  private async getCalendar() {
    const auth = await this.getAuth();
    return google.calendar({ version: 'v3', auth });
  }

  /**
   * Checks whether a given time slot is free on the clinic calendar.
   */
  async checkAvailability(startTime: string, durationMinutes: number): Promise<AvailabilityCheckResult> {
    try {
      const calendar = await this.getCalendar();
      const endDate = new Date(new Date(startTime).getTime() + durationMinutes * 60_000);

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: startTime,
          timeMax: endDate.toISOString(),
          items: [{ id: this.calendarId }],
        },
      });

      const busyPeriods = response.data.calendars?.[this.calendarId]?.busy ?? [];

      // The slot is available if there are zero busy periods in the range.
      // The freebusy API already constrains results to [timeMin, timeMax],
      // so any returned busy period necessarily overlaps.
      const available = busyPeriods.length === 0;

      return { available };
    } catch (error) {
      // On error, conservatively report the slot as unavailable
      return { available: false, alternatives: [] };
    }
  }

  /**
   * Suggests up to 3 alternative free slots on the same day (or next business day).
   * Only returns genuinely free gaps found via the freebusy API — never invents slots.
   */
  async suggestAlternatives(startTime: string, durationMinutes: number): Promise<AlternativeSlot[]> {
    const requestedDate = new Date(startTime);
    const durationMs = durationMinutes * 60_000;

    // Search the requested day first, then fall back to the next business day
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const searchDate = new Date(requestedDate);
      searchDate.setDate(searchDate.getDate() + dayOffset);

      // Skip weekends
      if (searchDate.getDay() === 0 || searchDate.getDay() === 6) {
        continue;
      }

      const dayStart = this.setHour(searchDate, BUSINESS_START_HOUR);
      const dayEnd = this.setHour(searchDate, BUSINESS_END_HOUR);

      // If the search window is entirely in the past, skip it
      const now = new Date();
      if (dayEnd.getTime() <= now.getTime()) {
        continue;
      }

      const alternatives = await this.findFreeSlots(
        dayStart.toISOString(),
        dayEnd.toISOString(),
        durationMs,
      );

      if (alternatives.length > 0) {
        return alternatives.slice(0, MAX_ALTERNATIVES);
      }
    }

    return [];
  }

  /**
   * Creates a calendar event on the clinic's Google Calendar.
   * Retries up to 3 times on transient (5xx / 429) errors.
   */
  async createEvent(startTime: string, endTime: string, summary: string, description?: string): Promise<BookingResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const calendar = await this.getCalendar();

        const eventBody: Record<string, unknown> = {
          summary,
          start: {
            dateTime: startTime,
          },
          end: {
            dateTime: endTime,
          },
        };

        if (description) {
          eventBody.description = description;
        }

        const response = await calendar.events.insert({
          calendarId: this.calendarId,
          requestBody: eventBody,
        });

        const eventId = response.data.id;
        if (!eventId) {
          return { success: false, error: 'Calendar event created but no ID was returned' };
        }

        return { success: true, calendar_event_id: eventId };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error creating event';

        // Only retry on transient errors
        const isTransient = this.isTransientError(error);
        if (!isTransient || attempt === MAX_RETRY_ATTEMPTS - 1) {
          break;
        }

        // Exponential backoff: 1s, 2s
        await this.sleep(1000 * (attempt + 1));
      }
    }

    return { success: false, error: lastError ?? 'Failed to create calendar event' };
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Queries the freebusy API for a given window and returns an array
   * of AlternativeSlot objects representing gaps >= durationMs.
   */
  private async findFreeSlots(
    windowStart: string,
    windowEnd: string,
    durationMs: number,
  ): Promise<AlternativeSlot[]> {
    try {
      const calendar = await this.getCalendar();

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: windowStart,
          timeMax: windowEnd,
          items: [{ id: this.calendarId }],
        },
      });

      const busyPeriods = response.data.calendars?.[this.calendarId]?.busy ?? [];

      if (busyPeriods.length === 0) {
        // Entire window is free — return the first possible slot
        const slotStart = new Date(windowStart);
        // Ensure we don't suggest a slot starting in the past
        const now = new Date();
        if (slotStart.getTime() < now.getTime()) {
          slotStart.setTime(now.getTime());
        }
        const slotEnd = new Date(slotStart.getTime() + durationMs);

        // Verify the slot fits within the business window
        if (slotEnd.getTime() <= new Date(windowEnd).getTime()) {
          return [{ start: slotStart.toISOString(), end: slotEnd.toISOString() }];
        }
        return [];
      }

      // Sort busy periods chronologically
      const sorted = [...busyPeriods]
        .filter((b) => b.start && b.end)
        .map((b) => ({
          start: new Date(b.start!).getTime(),
          end: new Date(b.end!).getTime(),
        }))
        .sort((a, b) => a.start - b.start);

      const windowStartMs = new Date(windowStart).getTime();
      const windowEndMs = new Date(windowEnd).getTime();
      const nowMs = Date.now();
      const alternatives: AlternativeSlot[] = [];

      // Examine the gap before the first busy period
      let cursor = Math.max(windowStartMs, nowMs);

      for (const busy of sorted) {
        const gapEnd = busy.start;
        const gapDuration = gapEnd - cursor;

        if (gapDuration >= durationMs && cursor < gapEnd) {
          const slotEndMs = cursor + durationMs;
          // Make sure the slot doesn't extend past the window
          if (slotEndMs <= windowEndMs) {
            alternatives.push({
              start: new Date(cursor).toISOString(),
              end: new Date(slotEndMs).toISOString(),
            });

            if (alternatives.length >= MAX_ALTERNATIVES) {
              return alternatives;
            }
          }
        }

        // Advance cursor past this busy block
        cursor = Math.max(cursor, busy.end);
      }

      // Examine the gap after the last busy period
      const remainingGap = windowEndMs - cursor;
      if (remainingGap >= durationMs) {
        const slotEndMs = cursor + durationMs;
        if (slotEndMs <= windowEndMs) {
          alternatives.push({
            start: new Date(cursor).toISOString(),
            end: new Date(slotEndMs).toISOString(),
          });
        }
      }

      return alternatives.slice(0, MAX_ALTERNATIVES);
    } catch (error) {
      // If the freebusy query fails, return no alternatives rather than throwing
      return [];
    }
  }

  /**
   * Sets the hours, minutes, seconds, and milliseconds of a date.
   */
  private setHour(date: Date, hour: number): Date {
    const result = new Date(date);
    result.setHours(hour, 0, 0, 0);
    return result;
  }

  /**
   * Determines whether an error is transient and worth retrying.
   */
  private isTransientError(error: unknown): boolean {
    if (error instanceof GaxiosError) {
      return TRANSIENT_STATUS_CODES.has(error.response?.status ?? 0);
    }
    // Retry on network errors that aren't GaxiosErrors (e.g. ECONNRESET)
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('etimedout') ||
        msg.includes('socket hang up') ||
        msg.includes('network')
      );
    }
    return false;
  }

  /**
   * Returns a promise that resolves after the given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
