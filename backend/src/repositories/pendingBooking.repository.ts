import { supabase } from '../lib/supabase';
import type { PendingBookingRow } from '../types';

export class PendingBookingRepository {
  /**
   * Clean up expired locks. Returns the number of rows deleted.
   */
  async cleanExpiredLocks(): Promise<number> {
    const { count, error } = await supabase
      .from('pending_bookings')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());

    if (error) {
      throw new Error(`Failed to clean expired locks: ${error.message}`);
    }

    return count ?? 0;
  }

  /**
   * Attempt to acquire a lock on a calendar slot.
   * First cleans expired locks, then attempts to insert.
   * Returns null if the unique constraint on (calendar_id, requested_slot) is violated.
   */
  async acquireLock(
    calendar_id: string,
    requested_slot: string,
    patient_id: string,
    ttlMinutes: number,
  ): Promise<PendingBookingRow | null> {
    // Always clean up expired locks before attempting to acquire
    await this.cleanExpiredLocks();

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('pending_bookings')
      .insert({
        calendar_id,
        requested_slot,
        patient_id,
        expires_at: expiresAt,
      })
      .select('*')
      .maybeSingle();

    // Unique constraint violation (code 23505 in Postgres, PGRST116 for no row)
    // Supabase wraps Postgres errors — a duplicate key results in a generic error
    if (error) {
      // Check for unique violation: Postgres error code 23505
      if (
        error.code === '23505' ||
        error.message.includes('duplicate key') ||
        error.message.includes('unique constraint')
      ) {
        return null;
      }
      throw new Error(`Failed to acquire booking lock: ${error.message}`);
    }

    // If no error but also no data (unlikely but safe guard)
    return data ? (data as PendingBookingRow) : null;
  }

  /**
   * Release an acquired lock by deleting the row.
   */
  async releaseLock(id: string): Promise<void> {
    const { error } = await supabase
      .from('pending_bookings')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to release booking lock [${id}]: ${error.message}`);
    }
  }

  /**
   * Find all pending bookings for a patient.
   */
  async findByPatientId(patient_id: string): Promise<PendingBookingRow[]> {
    const { data, error } = await supabase
      .from('pending_bookings')
      .select('*')
      .eq('patient_id', patient_id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(
        `Failed to fetch pending bookings for patient [${patient_id}]: ${error.message}`,
      );
    }

    return (data ?? []) as PendingBookingRow[];
  }
}

export const pendingBookingRepository = new PendingBookingRepository();
