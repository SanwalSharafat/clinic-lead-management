import { HumanReviewRepository } from '../src/repositories/humanReview.repository';
import { ReviewReason, HumanDecision } from '../src/types';
import type { HumanReviewRow } from '../src/types';

// Function declaration is hoisted — available inside jest.mock factory.
function createMockSupabase() {
  const chain: Record<string, jest.Mock> = {};
  const chainable = ['from', 'select', 'insert', 'update', 'eq', 'order', 'range', 'limit'];
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
  const chainable = ['from', 'select', 'insert', 'update', 'eq', 'order', 'range', 'limit'] as const;
  for (const m of chainable) {
    (supabase as any)[m].mockClear();
    (supabase as any)[m].mockReturnValue(supabase);
  }
  (supabase as any).single.mockClear();
  (supabase as any).maybeSingle.mockClear();
}

function makeReview(overrides: Partial<HumanReviewRow> = {}): HumanReviewRow {
  return {
    id: 'review-1',
    patient_id: 'patient-1',
    reason: ReviewReason.HIGH_SCORE,
    ai_output: null,
    human_decision: null,
    human_notes: null,
    reviewer_id: null,
    resolved: false,
    created_at: '2025-01-01T00:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

// ============================================================================
// Test suite: Human Review Repository (REPOSITORY layer)
// ============================================================================
describe('HumanReviewRepository', () => {
  let repo: HumanReviewRepository;

  beforeEach(() => {
    resetMocks();
    repo = new HumanReviewRepository();
  });

  // ========================================================================
  // 1. create inserts a review and returns it
  // ========================================================================
  describe('create', () => {
    it('inserts a review with required fields and returns the row', async () => {
      const newReview = makeReview({ id: 'review-new', reason: ReviewReason.LOW_AI_CONFIDENCE });
      (supabase as any).single.mockResolvedValueOnce({ data: newReview, error: null });

      const result = await repo.create({
        patient_id: 'patient-1',
        reason: ReviewReason.LOW_AI_CONFIDENCE,
      });

      expect(result.id).toBe('review-new');
      expect(result.patient_id).toBe('patient-1');
      expect(result.reason).toBe(ReviewReason.LOW_AI_CONFIDENCE);
      expect(result.resolved).toBe(false);

      expect((supabase as any).from).toHaveBeenCalledWith('human_reviews');
      expect((supabase as any).insert).toHaveBeenCalledTimes(1);
      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload.patient_id).toBe('patient-1');
      expect(insertPayload.reason).toBe(ReviewReason.LOW_AI_CONFIDENCE);
      expect(insertPayload.resolved).toBe(false);
    });

    it('includes ai_output in payload when provided', async () => {
      const aiOutput = { name: 'John', urgency: 'emergency' };
      const newReview = makeReview({ id: 'review-new', ai_output: aiOutput });
      (supabase as any).single.mockResolvedValueOnce({ data: newReview, error: null });

      await repo.create({
        patient_id: 'patient-1',
        reason: ReviewReason.AMBIGUOUS_RESPONSE,
        ai_output: aiOutput,
      });

      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload.ai_output).toEqual({ name: 'John', urgency: 'emergency' });
    });

    it('omits ai_output from payload when null or undefined', async () => {
      const newReview = makeReview({ id: 'review-new' });
      (supabase as any).single.mockResolvedValueOnce({ data: newReview, error: null });

      await repo.create({
        patient_id: 'patient-1',
        reason: ReviewReason.HIGH_SCORE,
      });

      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload).not.toHaveProperty('ai_output');
    });
  });

  // ========================================================================
  // 2. findById returns a review
  // ========================================================================
  describe('findById', () => {
    it('returns a review when it exists', async () => {
      const review = makeReview({ id: 'review-abc' });
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: review, error: null });

      const result = await repo.findById('review-abc');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('review-abc');
      expect(result!.patient_id).toBe('patient-1');
      expect(result!.reason).toBe(ReviewReason.HIGH_SCORE);
      expect(result!.resolved).toBe(false);

      expect((supabase as any).from).toHaveBeenCalledWith('human_reviews');
      expect((supabase as any).select).toHaveBeenCalledWith('*');
      expect((supabase as any).eq).toHaveBeenCalledWith('id', 'review-abc');
    });

    // ========================================================================
    // 3. findById returns null for non-existent review
    // ========================================================================
    it('returns null when review does not exist', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await repo.findById('nonexistent-review-id');

      expect(result).toBeNull();
      expect((supabase as any).from).toHaveBeenCalledWith('human_reviews');
      expect((supabase as any).eq).toHaveBeenCalledWith('id', 'nonexistent-review-id');
    });
  });

  // ========================================================================
  // 4. resolve updates decision, reviewer_id, resolved, resolved_at
  // ========================================================================
  describe('resolve', () => {
    it('sets human_decision, reviewer_id, resolved=true, and resolved_at', async () => {
      const resolvedReview = makeReview({
        id: 'review-1',
        human_decision: HumanDecision.APPROVE,
        reviewer_id: 'staff-001',
        resolved: true,
        resolved_at: '2025-01-01T01:00:00Z',
      });
      (supabase as any).single.mockResolvedValueOnce({ data: resolvedReview, error: null });

      const result = await repo.resolve('review-1', {
        human_decision: HumanDecision.APPROVE,
        reviewer_id: 'staff-001',
      });

      expect(result.resolved).toBe(true);
      expect(result.human_decision).toBe(HumanDecision.APPROVE);
      expect(result.reviewer_id).toBe('staff-001');
      expect(result.resolved_at).toBe('2025-01-01T01:00:00Z');

      const updatePayload = (supabase as any).update.mock.calls[0]![0];
      expect(updatePayload.human_decision).toBe(HumanDecision.APPROVE);
      expect(updatePayload.reviewer_id).toBe('staff-001');
      expect(updatePayload.resolved).toBe(true);
      expect(updatePayload.resolved_at).toBeDefined();
      expect(typeof updatePayload.resolved_at).toBe('string');
      expect(updatePayload).not.toHaveProperty('human_notes');
    });

    it('includes human_notes in update payload when provided', async () => {
      const resolvedReview = makeReview({
        human_decision: HumanDecision.REJECT,
        reviewer_id: 'staff-002',
        human_notes: 'Spam lead, not a real patient',
        resolved: true,
        resolved_at: '2025-01-01T02:00:00Z',
      });
      (supabase as any).single.mockResolvedValueOnce({ data: resolvedReview, error: null });

      const result = await repo.resolve('review-1', {
        human_decision: HumanDecision.REJECT,
        reviewer_id: 'staff-002',
        human_notes: 'Spam lead, not a real patient',
      });

      expect(result.human_notes).toBe('Spam lead, not a real patient');

      const updatePayload = (supabase as any).update.mock.calls[0]![0];
      expect(updatePayload.human_notes).toBe('Spam lead, not a real patient');
    });

    it('omits human_notes when null', async () => {
      const resolvedReview = makeReview({
        human_decision: HumanDecision.ESCALATE,
        reviewer_id: 'staff-003',
        resolved: true,
        resolved_at: '2025-01-01T03:00:00Z',
      });
      (supabase as any).single.mockResolvedValueOnce({ data: resolvedReview, error: null });

      await repo.resolve('review-1', {
        human_decision: HumanDecision.ESCALATE,
        reviewer_id: 'staff-003',
      });

      const updatePayload = (supabase as any).update.mock.calls[0]![0];
      expect(updatePayload).not.toHaveProperty('human_notes');
    });
  });

  // ========================================================================
  // 5. list returns reviews with filters
  // ========================================================================
  describe('list', () => {
    it('returns all reviews when no filters (defaults: limit=50, offset=0)', async () => {
      const reviews = [makeReview({ id: 'r1' }), makeReview({ id: 'r2' })];
      (supabase as any).range.mockResolvedValueOnce({ data: reviews, error: null });

      const result = await repo.list();

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
      expect(result[1]!.id).toBe('r2');

      expect((supabase as any).from).toHaveBeenCalledWith('human_reviews');
      expect((supabase as any).select).toHaveBeenCalledWith('*');
      expect((supabase as any).order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect((supabase as any).range).toHaveBeenCalledWith(0, 49);
    });

    it('applies resolved filter', async () => {
      (supabase as any).range.mockResolvedValueOnce({ data: [], error: null });

      await repo.list({ resolved: false });

      expect((supabase as any).eq).toHaveBeenCalledWith('resolved', false);
    });

    it('applies reason filter', async () => {
      (supabase as any).range.mockResolvedValueOnce({ data: [], error: null });

      await repo.list({ reason: ReviewReason.BOOKING_FAILURE });

      expect((supabase as any).eq).toHaveBeenCalledWith('reason', ReviewReason.BOOKING_FAILURE);
    });

    it('applies both resolved and reason filters', async () => {
      (supabase as any).range.mockResolvedValueOnce({ data: [], error: null });

      await repo.list({ resolved: true, reason: ReviewReason.DATA_CONFLICT });

      const eqCalls = (supabase as any).eq.mock.calls;
      const eqArgs = eqCalls.map((c: any[]) => c);
      expect(eqArgs).toContainEqual(['resolved', true]);
      expect(eqArgs).toContainEqual(['reason', ReviewReason.DATA_CONFLICT]);
    });

    it('applies custom limit and offset', async () => {
      (supabase as any).range.mockResolvedValueOnce({ data: [], error: null });

      await repo.list({ limit: 10, offset: 20 });

      expect((supabase as any).range).toHaveBeenCalledWith(20, 29);
    });

    it('returns empty array when no reviews match', async () => {
      (supabase as any).range.mockResolvedValueOnce({ data: null, error: null });

      const result = await repo.list({ resolved: true });

      expect(result).toEqual([]);
    });
  });

  // ========================================================================
  // 6. findOpenByPatientId returns unresolved review
  // ========================================================================
  describe('findOpenByPatientId', () => {
    it('returns an unresolved review for a patient', async () => {
      const openReview = makeReview({
        id: 'review-open-1',
        patient_id: 'patient-42',
        resolved: false,
        reason: ReviewReason.PATIENT_REQUESTED_HUMAN,
      });
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: openReview, error: null });

      const result = await repo.findOpenByPatientId('patient-42');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('review-open-1');
      expect(result!.patient_id).toBe('patient-42');
      expect(result!.resolved).toBe(false);
      expect(result!.reason).toBe(ReviewReason.PATIENT_REQUESTED_HUMAN);

      expect((supabase as any).from).toHaveBeenCalledWith('human_reviews');
      expect((supabase as any).select).toHaveBeenCalledWith('*');
      expect((supabase as any).eq).toHaveBeenCalledWith('patient_id', 'patient-42');
      expect((supabase as any).eq).toHaveBeenCalledWith('resolved', false);
    });

    it('returns null when no open review exists for patient', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await repo.findOpenByPatientId('patient-no-reviews');

      expect(result).toBeNull();
      expect((supabase as any).eq).toHaveBeenCalledWith('patient_id', 'patient-no-reviews');
      expect((supabase as any).eq).toHaveBeenCalledWith('resolved', false);
    });

    it('returns null even if a resolved review exists for patient', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await repo.findOpenByPatientId('patient-with-resolved');

      expect(result).toBeNull();
      expect((supabase as any).eq).toHaveBeenCalledWith('patient_id', 'patient-with-resolved');
      expect((supabase as any).eq).toHaveBeenCalledWith('resolved', false);
    });
  });
});
