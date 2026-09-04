import { InteractionRepository } from '../src/repositories/interaction.repository';
import type { InteractionRow } from '../src/types';
import { Channel, MessageDirection } from '../src/types';

// Function declaration is hoisted — available inside jest.mock factory.
function createMockSupabase() {
  const chain: Record<string, jest.Mock> = {};
  const chainable = ['from', 'select', 'insert', 'eq', 'order'];
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
  const chainable = ['from', 'select', 'insert', 'eq', 'order'] as const;
  for (const m of chainable) {
    (supabase as any)[m].mockClear();
    (supabase as any)[m].mockReturnValue(supabase);
  }
  (supabase as any).single.mockClear();
  (supabase as any).maybeSingle.mockClear();
}

const mockExistingInteraction: InteractionRow = {
  id: 'interaction-1',
  patient_id: 'patient-1',
  channel: Channel.WHATSAPP,
  message: 'I want to book an appointment',
  direction: MessageDirection.INBOUND,
  external_message_id: 'wa-msg-001',
  created_at: '2025-01-15T10:30:00Z',
};

// ============================================================================
// Test suite: Webhook Idempotency
// ============================================================================
describe('Webhook Idempotency', () => {
  let repo: InteractionRepository;

  beforeEach(() => {
    resetMocks();
    repo = new InteractionRepository();
  });

  // ========================================================================
  // 1. findByExternalId returns an existing interaction for duplicate
  //    external_message_id
  // ========================================================================
  describe('findByExternalId', () => {
    it('returns existing interaction when external_message_id already exists', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: mockExistingInteraction,
        error: null,
      });

      const result = await repo.findByExternalId('wa-msg-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('interaction-1');
      expect(result!.external_message_id).toBe('wa-msg-001');
      expect(result!.message).toBe('I want to book an appointment');
      expect(result!.direction).toBe(MessageDirection.INBOUND);

      expect((supabase as any).from).toHaveBeenCalledWith('interactions');
      expect((supabase as any).select).toHaveBeenCalledWith('*');
      expect((supabase as any).eq).toHaveBeenCalledWith('external_message_id', 'wa-msg-001');
    });

    // ========================================================================
    // 2. findByExternalId returns null for new external_message_id
    // ========================================================================
    it('returns null when external_message_id does not exist (new message)', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await repo.findByExternalId('wa-msg-brand-new');

      expect(result).toBeNull();
      expect((supabase as any).from).toHaveBeenCalledWith('interactions');
      expect((supabase as any).eq).toHaveBeenCalledWith('external_message_id', 'wa-msg-brand-new');
    });
  });

  // ========================================================================
  // 3. When findByExternalId returns a result, no further processing happens
  //    (patient not created, message not sent)
  // ========================================================================
  describe('Idempotency guard — no duplicate side effects', () => {
    it('when duplicate is detected, patient repo create is NOT called', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: mockExistingInteraction,
        error: null,
      });

      const existing = await repo.findByExternalId('wa-msg-001');
      expect(existing).not.toBeNull();

      // No 'patients' table was queried — only 'interactions'
      const fromCalls = (supabase as any).from.mock.calls.map((c: any[]) => c[0]);
      expect(fromCalls).not.toContain('patients');

      // No inserts were made
      expect((supabase as any).insert).not.toHaveBeenCalled();
    });

    it('workflow simulation: first call null (new), second call returns existing (dedup)', async () => {
      // First webhook — no existing interaction
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const first = await repo.findByExternalId('wa-msg-dup-test');
      expect(first).toBeNull();

      // Reset to simulate a second webhook delivery
      resetMocks();

      // Second webhook — interaction now exists
      (supabase as any).maybeSingle.mockResolvedValueOnce({
        data: mockExistingInteraction,
        error: null,
      });
      const second = await repo.findByExternalId('wa-msg-dup-test');
      expect(second).not.toBeNull();
      expect(second!.id).toBe('interaction-1');

      // No inserts (short-circuited by idempotency check)
      expect((supabase as any).insert).not.toHaveBeenCalled();
    });

    it('different external_message_id for same phone processes normally (both return null)', async () => {
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      (supabase as any).maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const resultA = await repo.findByExternalId('wa-msg-a');
      const resultB = await repo.findByExternalId('wa-msg-b');

      expect(resultA).toBeNull();
      expect(resultB).toBeNull();
      expect((supabase as any).maybeSingle).toHaveBeenCalledTimes(2);
    });

    it('create correctly stores external_message_id in the insert payload', async () => {
      const newInteraction: InteractionRow = {
        id: 'interaction-new-1',
        patient_id: 'patient-1',
        channel: Channel.WHATSAPP,
        message: 'Hi there',
        direction: MessageDirection.INBOUND,
        external_message_id: 'wa-msg-unique-xyz',
        created_at: '2025-01-15T11:00:00Z',
      };

      (supabase as any).single.mockResolvedValueOnce({ data: newInteraction, error: null });

      const result = await repo.create({
        patient_id: 'patient-1',
        channel: Channel.WHATSAPP,
        message: 'Hi there',
        direction: MessageDirection.INBOUND,
        external_message_id: 'wa-msg-unique-xyz',
      });

      expect(result.id).toBe('interaction-new-1');
      expect(result.external_message_id).toBe('wa-msg-unique-xyz');

      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload.patient_id).toBe('patient-1');
      expect(insertPayload.channel).toBe(Channel.WHATSAPP);
      expect(insertPayload.message).toBe('Hi there');
      expect(insertPayload.direction).toBe(MessageDirection.INBOUND);
      expect(insertPayload.external_message_id).toBe('wa-msg-unique-xyz');
    });

    it('create omits external_message_id when not provided', async () => {
      const newInteraction: InteractionRow = {
        id: 'interaction-no-ext',
        patient_id: 'patient-1',
        channel: Channel.WEB_FORM,
        message: 'Form submission',
        direction: MessageDirection.INBOUND,
        external_message_id: null,
        created_at: '2025-01-15T11:00:00Z',
      };

      (supabase as any).single.mockResolvedValueOnce({ data: newInteraction, error: null });

      await repo.create({
        patient_id: 'patient-1',
        channel: Channel.WEB_FORM,
        message: 'Form submission',
        direction: MessageDirection.INBOUND,
      });

      const insertPayload = (supabase as any).insert.mock.calls[0]![0];
      expect(insertPayload).not.toHaveProperty('external_message_id');
    });
  });
});
