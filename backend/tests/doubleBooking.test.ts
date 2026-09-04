import { PendingBookingRepository } from '../src/repositories/pendingBooking.repository';
import type { PendingBookingRow } from '../src/types';

// Function declaration is hoisted — available inside jest.mock factory.
function createMockSupabase() {
  const chain: Record<string, jest.Mock> = {};
  const chainable = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'lt', 'order'];
  for (const m of chainable) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  // Terminal methods
  chain['single'] = jest.fn();
  chain['maybeSingle'] = jest.fn();
  return chain;
}

jest.mock('../src/lib/supabase', () => ({
  supabase: createMockSupabase(),
}));

import { supabase } from '../src/lib/supabase';

function resetMocks() {
  const chainable = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'lt', 'order'] as const;
  for (const m of chainable) {
    (supabase as any)[m].mockClear();
    (supabase as any)[m].mockReturnValue(supabase);
  }
  (supabase as any).single.mockClear();
  (supabase as any).maybeSingle.mockClear();
}

// ---- Constants ----
const CALENDAR_ID = 'cal-primary';
const SLOT = '2025-07-15T10:00:00Z';
const PATIENT_A = 'patient-A';
const PATIENT_B = 'patient-B';

function makeLockRow(overrides: Partial<PendingBookingRow> = {}): PendingBookingRow {
  return {
    id: 'lock-1',
    requested_slot: SLOT,
    calendar_id: CALENDAR_ID,
    patient_id: PATIENT_A,
    expires_at: '2025-07-15T10:05:00Z',
    created_at: '2025-07-15T09:59:00Z',
    ...overrides,
  };
}

// ============================================================================
// Test suite: Double-Booking Prevention (Repository level)
// ============================================================================
describe('PendingBookingRepository — Double-Booking Prevention', () => {
  let repo: PendingBookingRepository;

  beforeEach(() => {
    resetMocks();
    repo = new PendingBookingRepository();
  });

  // ========================================================================
  // 1. acquireLock: first call succeeds (returns lock row)
  // ========================================================================
  describe('acquireLock', () => {
    it('first call succeeds and returns the lock row', async () => {
      // acquireLock first calls cleanExpiredLocks internally:
      //   supabase.from('pending_bookings').delete({count:'exact'}).lt('expires_at', ...)
      // lt is the terminal call for cleanExpiredLocks
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });

      // Then acquireLock does:
      //   supabase.from('pending_bookings').insert({...}).select('*').maybeSingle()
      // maybeSingle is the terminal call
      const lockRow = makeLockRow();
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: lockRow, error: null });

      const result = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_A, 5);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('lock-1');
      expect(result!.calendar_id).toBe(CALENDAR_ID);
      expect(result!.requested_slot).toBe(SLOT);
      expect(result!.patient_id).toBe(PATIENT_A);

      // Verify cleanExpiredLocks was called
      expect((supabase as any).from).toHaveBeenCalledWith('pending_bookings');
      expect((supabase as any).delete).toHaveBeenCalledWith({ count: 'exact' });
      expect((supabase as any).lt).toHaveBeenCalledWith('expires_at', expect.any(String));

      // Verify the insert payload
      expect((supabase as any).insert).toHaveBeenCalledTimes(1);
      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload.calendar_id).toBe(CALENDAR_ID);
      expect(insertPayload.requested_slot).toBe(SLOT);
      expect(insertPayload.patient_id).toBe(PATIENT_A);
      expect(insertPayload.expires_at).toBeDefined();
      expect(typeof insertPayload.expires_at).toBe('string');
    });

    // ========================================================================
    // 2. acquireLock: second call for same slot fails (unique constraint)
    // ========================================================================
    it('second call for same slot returns null on unique constraint violation', async () => {
      // First call: lock acquired
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: makeLockRow({ id: 'lock-first' }),
        error: null,
      });

      const first = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_A, 5);
      expect(first).not.toBeNull();
      expect(first!.id).toBe('lock-first');

      // Second call: same slot, different patient → unique constraint
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "pending_bookings_calendar_id_requested_slot_key"',
        },
      });

      const second = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_B, 5);
      expect(second).toBeNull();
    });

    it('throws on non-unique-constraint error', async () => {
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { code: '42P01', message: 'relation "pending_bookings" does not exist' },
      });

      await expect(
        repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_A, 5),
      ).rejects.toThrow('Failed to acquire booking lock');
    });

    it('returns null when error message contains "duplicate key"', async () => {
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'UNKNOWN', message: 'duplicate key value violates constraint' },
      });

      const result = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_A, 5);
      expect(result).toBeNull();
    });

    it('returns null when error message contains "unique constraint"', async () => {
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'UNKNOWN', message: 'unique constraint violation' },
      });

      const result = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_A, 5);
      expect(result).toBeNull();
    });

    it('returns null when maybeSingle returns no data and no error', async () => {
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_A, 5);
      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // 3. releaseLock: deletes the lock row
  // ========================================================================
  describe('releaseLock', () => {
    it('deletes the lock row by id', async () => {
      // releaseLock chain: supabase.from('pending_bookings').delete().eq('id', id)
      // eq is the terminal call
      (supabase as any).eq.mockResolvedValueOnce({ error: null });

      await repo.releaseLock('lock-1');

      expect((supabase as any).from).toHaveBeenCalledWith('pending_bookings');
      expect((supabase as any).delete).toHaveBeenCalledWith();
      expect((supabase as any).eq).toHaveBeenCalledWith('id', 'lock-1');
    });

    it('throws when delete fails', async () => {
      (supabase as any).eq.mockResolvedValueOnce({
        error: { message: 'connection refused' },
      });

      await expect(
        repo.releaseLock('lock-bad'),
      ).rejects.toThrow('Failed to release booking lock [lock-bad]');
    });
  });

  // ========================================================================
  // 4. cleanExpiredLocks: deletes expired rows, returns count
  // ========================================================================
  describe('cleanExpiredLocks', () => {
    it('returns 0 when no expired locks exist', async () => {
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });

      const count = await repo.cleanExpiredLocks();

      expect(count).toBe(0);
      expect((supabase as any).from).toHaveBeenCalledWith('pending_bookings');
      expect((supabase as any).delete).toHaveBeenCalledWith({ count: 'exact' });
      expect((supabase as any).lt).toHaveBeenCalledWith('expires_at', expect.any(String));
    });

    it('returns the number of deleted expired locks', async () => {
      (supabase as any).lt.mockResolvedValueOnce({ count: 3, error: null });

      const count = await repo.cleanExpiredLocks();
      expect(count).toBe(3);
    });

    it('returns 0 when count is null', async () => {
      (supabase as any).lt.mockResolvedValueOnce({ count: null, error: null });

      const count = await repo.cleanExpiredLocks();
      expect(count).toBe(0);
    });

    it('throws on database error', async () => {
      (supabase as any).lt.mockResolvedValueOnce({
        count: null,
        error: { message: 'connection timeout' },
      });

      await expect(
        repo.cleanExpiredLocks(),
      ).rejects.toThrow('Failed to clean expired locks');
    });
  });

  // ========================================================================
  // 5. After cleanExpiredLocks, a previously locked slot can be acquired again
  // ========================================================================
  describe('Lock expiry and re-acquisition', () => {
    it('locked slot becomes available after expiry is cleaned', async () => {
      // ---- First attempt: slot is locked (unique constraint) ----
      (supabase as any).lt.mockResolvedValueOnce({ count: 0, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      });

      const first = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_B, 5);
      expect(first).toBeNull(); // locked

      // ---- Time passes, lock expires ----
      // ---- Second attempt: cleanExpiredLocks removes the stale lock ----
      (supabase as any).lt.mockResolvedValueOnce({ count: 1, error: null });
      const newLock = makeLockRow({ id: 'lock-new', patient_id: PATIENT_B });
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: newLock, error: null });

      const second = await repo.acquireLock(CALENDAR_ID, SLOT, PATIENT_B, 5);

      expect(second).not.toBeNull();
      expect(second!.id).toBe('lock-new');
      expect(second!.patient_id).toBe(PATIENT_B);
      expect(second!.requested_slot).toBe(SLOT);
      expect(second!.calendar_id).toBe(CALENDAR_ID);

      // cleanExpiredLocks was called twice (once per acquireLock)
      expect((supabase as any).lt).toHaveBeenCalledTimes(2);
    });
  });
});
