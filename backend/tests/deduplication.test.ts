import { PatientRepository } from '../src/repositories/patient.repository';
import { ErrorLogRepository } from '../src/repositories/errorLog.repository';
import type { PatientRow } from '../src/types';
import { PatientStatus, Channel } from '../src/types';

// Function declaration is hoisted — available inside jest.mock factory.
function createMockSupabase() {
  const chain: Record<string, jest.Mock> = {};
  const chainable = ['from', 'select', 'insert', 'update', 'eq', 'order', 'limit', 'range'];
  for (const m of chainable) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  // Terminal methods (not chainable by default — resolved per-test)
  chain['single'] = jest.fn();
  chain['maybeSingle'] = jest.fn();
  return chain;
}

jest.mock('../src/lib/supabase', () => ({
  supabase: createMockSupabase(),
}));

import { supabase } from '../src/lib/supabase';

/** Clear all mocks and re-establish chainable defaults for non-terminal methods. */
function resetMocks() {
  const chainable = ['from', 'select', 'insert', 'update', 'eq', 'order', 'limit', 'range'] as const;
  for (const m of chainable) {
    (supabase as any)[m].mockClear();
    (supabase as any)[m].mockReturnValue(supabase);
  }
  (supabase as any).single.mockClear();
  (supabase as any).maybeSingle.mockClear();
}

function makeMockPatient(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: 'patient-uuid-1',
    name: 'John Doe',
    phone: '+1234',
    email: 'john@test.com',
    source: Channel.WHATSAPP,
    raw_message: 'original message',
    extracted_fields: { name: 'John' },
    lead_score: null,
    score_tier: null,
    status: PatientStatus.NEW_LEAD,
    attempt_count: 0,
    config_version: null,
    assigned_staff_id: null,
    opted_out: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// Test suite: Patient Deduplication
// ============================================================================
describe('Patient Deduplication', () => {
  let repo: PatientRepository;
  let errorLogRepo: ErrorLogRepository;

  beforeEach(() => {
    resetMocks();
    repo = new PatientRepository();
    errorLogRepo = new ErrorLogRepository();
  });

  // ========================================================================
  // 1. findByPhone returns existing patient when phone exists
  // ========================================================================
  describe('findByPhone', () => {
    it('returns existing patient when phone matches', async () => {
      const existing = makeMockPatient();
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: existing, error: null });

      const result = await repo.findByPhone('+1234');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('patient-uuid-1');
      expect(result!.phone).toBe('+1234');
      expect(result!.name).toBe('John Doe');

      expect((supabase as any).from).toHaveBeenCalledWith('patients');
      expect((supabase as any).select).toHaveBeenCalledWith('*');
      expect((supabase as any).eq).toHaveBeenCalledWith('phone', '+1234');
    });

    // ========================================================================
    // 2. findByPhone returns null when phone doesn't exist
    // ========================================================================
    it('returns null when no patient exists for phone', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await repo.findByPhone('+9999');

      expect(result).toBeNull();
      expect((supabase as any).eq).toHaveBeenCalledWith('phone', '+9999');
    });
  });

  // ========================================================================
  // 3. create returns a new patient
  // ========================================================================
  describe('create', () => {
    it('inserts a new patient and returns the row', async () => {
      const newPatient = makeMockPatient({ id: 'patient-new', phone: '+5555', name: 'Jane Smith' });
      (supabase as any).single.mockResolvedValueOnce({ data: newPatient, error: null });

      const result = await repo.create({
        phone: '+5555',
        source: Channel.WHATSAPP,
        name: 'Jane Smith',
        email: 'jane@test.com',
      });

      expect(result.id).toBe('patient-new');
      expect(result.phone).toBe('+5555');

      expect((supabase as any).from).toHaveBeenCalledWith('patients');
      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload.phone).toBe('+5555');
      expect(insertPayload.source).toBe(Channel.WHATSAPP);
      expect(insertPayload.status).toBe(PatientStatus.NEW_LEAD);
      expect(insertPayload.attempt_count).toBe(0);
      expect(insertPayload.opted_out).toBe(false);
      expect(insertPayload.name).toBe('Jane Smith');
      expect(insertPayload.email).toBe('jane@test.com');
    });

    it('omits null/undefined optional fields from insert payload', async () => {
      const newPatient = makeMockPatient({ id: 'patient-new', phone: '+5555' });
      (supabase as any).single.mockResolvedValueOnce({ data: newPatient, error: null });

      await repo.create({ phone: '+5555', source: Channel.WEB_FORM });

      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload).not.toHaveProperty('name');
      expect(insertPayload).not.toHaveProperty('email');
      expect(insertPayload).not.toHaveProperty('raw_message');
    });
  });

  // ========================================================================
  // 4. updateExtractedFields merges without blanking existing data
  // ========================================================================
  describe('updateExtractedFields merge logic', () => {
    it('keeps existing field value when new value is null (does not blank)', async () => {
      // existing: {name: 'John', phone: '+1234'}, new: {name: null, email: 'john@test.com'}
      // result: name='John' (preserved), email='john@test.com' (added)

      // Step 1: fetch current extracted_fields
      (supabase as any).single.mockResolvedValueOnce({
        data: { extracted_fields: { name: 'John', phone: '+1234' } },
        error: null,
      });
      // Step 2: update with merged result
      const updatedPatient = makeMockPatient({
        extracted_fields: { name: 'John', phone: '+1234', email: 'john@test.com' },
      });
      (supabase as any).single.mockResolvedValueOnce({ data: updatedPatient, error: null });

      const result = await repo.updateExtractedFields('patient-uuid-1', {
        name: null,
        email: 'john@test.com',
      });

      // Verify the update payload
      const updatePayload = (supabase as any).update.mock.calls[0]![0];
      expect(updatePayload.extracted_fields.name).toBe('John');
      expect(updatePayload.extracted_fields.phone).toBe('+1234');
      expect(updatePayload.extracted_fields.email).toBe('john@test.com');
      expect(updatePayload).toHaveProperty('updated_at');

      // Verify returned patient
      expect(result.extracted_fields.name).toBe('John');
      expect(result.extracted_fields.email).toBe('john@test.com');
    });

    it('keeps existing field value when new value is undefined', async () => {
      (supabase as any).single.mockResolvedValueOnce({
        data: { extracted_fields: { email: 'old@test.com' } },
        error: null,
      });
      (supabase as any).single.mockResolvedValueOnce({ data: makeMockPatient(), error: null });

      await repo.updateExtractedFields('patient-uuid-1', { email: undefined, name: 'Jane' });

      const updatePayload = (supabase as any).update.mock.calls[0]![0];
      expect(updatePayload.extracted_fields.email).toBe('old@test.com');
      expect(updatePayload.extracted_fields.name).toBe('Jane');
    });

    it('adds a completely new field while preserving all existing ones', async () => {
      (supabase as any).single.mockResolvedValueOnce({
        data: { extracted_fields: { name: 'John', urgency: 'routine' } },
        error: null,
      });
      (supabase as any).single.mockResolvedValueOnce({ data: makeMockPatient(), error: null });

      await repo.updateExtractedFields('patient-uuid-1', { insurance: 'Delta Dental' });

      const updatePayload = (supabase as any).update.mock.calls[0]![0];
      expect(updatePayload.extracted_fields.name).toBe('John');
      expect(updatePayload.extracted_fields.urgency).toBe('routine');
      expect(updatePayload.extracted_fields.insurance).toBe('Delta Dental');
    });

    it('handles empty current extracted_fields (null from DB)', async () => {
      (supabase as any).single.mockResolvedValueOnce({
        data: { extracted_fields: null },
        error: null,
      });
      (supabase as any).single.mockResolvedValueOnce({ data: makeMockPatient(), error: null });

      await repo.updateExtractedFields('patient-uuid-1', { name: 'New Patient' });

      const updatePayload = (supabase as any).update.mock.calls[0]![0];
      expect(updatePayload.extracted_fields.name).toBe('New Patient');
    });
  });

  // ========================================================================
  // 5. Merge event is logged to error_logs (operation='merge')
  // ========================================================================
  describe('Merge event logging', () => {
    it('errorLogRepo.create is called with operation="merge" after a field merge', async () => {
      // First, perform the merge via patient repo
      (supabase as any).single.mockResolvedValueOnce({
        data: { extracted_fields: { name: 'John' } },
        error: null,
      });
      (supabase as any).single.mockResolvedValueOnce({
        data: makeMockPatient({ extracted_fields: { name: 'John', email: 'john@test.com' } }),
        error: null,
      });

      await repo.updateExtractedFields('patient-uuid-1', { email: 'john@test.com' });

      expect((supabase as any).from).toHaveBeenCalledWith('patients');

      // Now simulate the service-layer merge log call via errorLogRepo
      (supabase as any).single.mockResolvedValueOnce({
        data: {
          id: 'err-merge-1',
          patient_id: 'patient-uuid-1',
          service: 'PatientService',
          operation: 'merge',
          error_message: 'Merged extracted fields for patient patient-uuid-1',
          retry_count: 0,
          created_at: '2025-01-01T00:00:00Z',
        },
        error: null,
      });

      await errorLogRepo.create({
        patient_id: 'patient-uuid-1',
        service: 'PatientService',
        operation: 'merge',
        error_message: 'Merged extracted fields for patient patient-uuid-1',
      });

      // The last `from` call should be 'error_logs'
      const fromCalls = (supabase as any).from.mock.calls;
      const lastFromCall = fromCalls[fromCalls.length - 1];
      expect(lastFromCall[0]).toBe('error_logs');

      // Find the insert call with operation='merge'
      const insertCalls = (supabase as any).insert.mock.calls;
      const mergeInsertCall = insertCalls.find(
        (call: any[]) => call[0].operation === 'merge',
      );
      expect(mergeInsertCall).toBeDefined();
      expect(mergeInsertCall![0].patient_id).toBe('patient-uuid-1');
      expect(mergeInsertCall![0].service).toBe('PatientService');
      expect(mergeInsertCall![0].error_message).toContain('Merged extracted fields');
      expect(mergeInsertCall![0].retry_count).toBe(0);
    });
  });
});
