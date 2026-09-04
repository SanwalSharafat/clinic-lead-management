import {
  incomingWhatsAppSchema,
  incomingFormSchema,
  aiExtractionSchema,
  scoringRuleSchema,
  approveReviewSchema,
  correctReviewSchema,
  escalateReviewSchema,
  rejectReviewSchema,
  bookingRequestSchema,
} from '../src/validators/schemas';

// ========================================================
// 1. incomingWhatsAppSchema
// ========================================================
describe('incomingWhatsAppSchema', () => {
  it('valid input passes', () => {
    const result = incomingWhatsAppSchema.safeParse({
      phone: '+14155552671',
      message: 'I need an appointment',
      external_message_id: 'wamid-abc123',
    });
    expect(result.success).toBe(true);
  });

  it('missing phone fails', () => {
    const result = incomingWhatsAppSchema.safeParse({
      message: 'Hello',
      external_message_id: 'wamid-abc',
    });
    expect(result.success).toBe(false);
  });

  it('invalid phone format fails', () => {
    const result = incomingWhatsAppSchema.safeParse({
      phone: 'not-a-phone',
      message: 'Hello',
      external_message_id: 'wamid-abc',
    });
    expect(result.success).toBe(false);
  });

  it('missing message fails', () => {
    const result = incomingWhatsAppSchema.safeParse({
      phone: '+14155552671',
      external_message_id: 'wamid-abc',
    });
    expect(result.success).toBe(false);
  });

  it('timestamp is optional', () => {
    const result = incomingWhatsAppSchema.safeParse({
      phone: '+14155552671',
      message: 'Hi',
      external_message_id: 'wamid-123',
      timestamp: '2025-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

// ========================================================
// 2. incomingFormSchema
// ========================================================
describe('incomingFormSchema', () => {
  it('valid input passes', () => {
    const result = incomingFormSchema.safeParse({
      phone: '+14155552671',
      name: 'John Doe',
      email: 'john@example.com',
      message: 'Need a checkup',
      urgency: 'routine',
    });
    expect(result.success).toBe(true);
  });

  it('phone-only passes (all other fields optional)', () => {
    const result = incomingFormSchema.safeParse({
      phone: '+14155552671',
    });
    expect(result.success).toBe(true);
  });

  it('invalid email fails', () => {
    const result = incomingFormSchema.safeParse({
      phone: '+14155552671',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('invalid phone fails', () => {
    const result = incomingFormSchema.safeParse({
      phone: '000',
      email: 'valid@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('empty string email passes', () => {
    const result = incomingFormSchema.safeParse({
      phone: '+14155552671',
      email: '',
    });
    expect(result.success).toBe(true);
  });
});

// ========================================================
// 3. aiExtractionSchema
// ========================================================
describe('aiExtractionSchema', () => {
  const validInput = {
    extracted_fields: { urgency: 'emergency' },
    answer: 'Please come in immediately.',
    is_clinical_question: true,
    is_ambiguous: false,
    confidence: 0.95,
    missing_required_fields: ['insurance'],
  };

  it('valid input passes', () => {
    const result = aiExtractionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('missing confidence fails', () => {
    const { confidence, ...rest } = validInput;
    const result = aiExtractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('confidence out of range (> 1) fails', () => {
    const result = aiExtractionSchema.safeParse({ ...validInput, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it('confidence out of range (< 0) fails', () => {
    const result = aiExtractionSchema.safeParse({ ...validInput, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('is_clinical_question wrong type (string) fails', () => {
    const result = aiExtractionSchema.safeParse({
      ...validInput,
      is_clinical_question: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('defaults extracted_fields to {} and missing_required_fields to []', () => {
    const result = aiExtractionSchema.safeParse({
      answer: 'test',
      is_clinical_question: false,
      is_ambiguous: false,
      confidence: 0.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extracted_fields).toEqual({});
      expect(result.data.missing_required_fields).toEqual([]);
    }
  });
});

// ========================================================
// 4. scoringRuleSchema
// ========================================================
describe('scoringRuleSchema', () => {
  it('valid rule passes', () => {
    const result = scoringRuleSchema.safeParse({
      field: 'urgency',
      operator: 'equals',
      value: 'emergency',
      points: 40,
    });
    expect(result.success).toBe(true);
  });

  it('invalid operator fails', () => {
    const result = scoringRuleSchema.safeParse({
      field: 'urgency',
      operator: 'not_a_real_op',
      value: 'emergency',
      points: 40,
    });
    expect(result.success).toBe(false);
  });

  it('negative points fails', () => {
    const result = scoringRuleSchema.safeParse({
      field: 'urgency',
      operator: 'equals',
      value: 'emergency',
      points: -5,
    });
    expect(result.success).toBe(false);
  });

  it('missing operator fails', () => {
    const result = scoringRuleSchema.safeParse({
      field: 'urgency',
      value: 'emergency',
      points: 10,
    });
    expect(result.success).toBe(false);
  });

  it('boolean value for exists operator passes', () => {
    const result = scoringRuleSchema.safeParse({
      field: 'insurance',
      operator: 'exists',
      value: true,
      points: 10,
    });
    expect(result.success).toBe(true);
  });
});

// ========================================================
// 5. Review action schemas
// ========================================================
const validUUID = '550e8400-e29b-41d4-a716-446655440000';

describe('approveReviewSchema', () => {
  it('valid input passes', () => {
    const result = approveReviewSchema.safeParse({ reviewer_id: validUUID });
    expect(result.success).toBe(true);
  });

  it('missing reviewer_id fails', () => {
    const result = approveReviewSchema.safeParse({ notes: 'Looks good' });
    expect(result.success).toBe(false);
  });

  it('invalid UUID for reviewer_id fails', () => {
    const result = approveReviewSchema.safeParse({ reviewer_id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('correctReviewSchema', () => {
  it('valid input passes', () => {
    const result = correctReviewSchema.safeParse({
      reviewer_id: validUUID,
      corrected_fields: { urgency: 'urgent' },
    });
    expect(result.success).toBe(true);
  });

  it('missing reviewer_id fails', () => {
    const result = correctReviewSchema.safeParse({
      corrected_fields: { urgency: 'urgent' },
    });
    expect(result.success).toBe(false);
  });
});

describe('escalateReviewSchema', () => {
  it('valid input passes', () => {
    const result = escalateReviewSchema.safeParse({
      reviewer_id: validUUID,
      notes: 'Needs doctor review',
    });
    expect(result.success).toBe(true);
  });

  it('missing reviewer_id fails', () => {
    const result = escalateReviewSchema.safeParse({
      notes: 'Needs review',
    });
    expect(result.success).toBe(false);
  });

  it('missing notes fails (required for escalation)', () => {
    const result = escalateReviewSchema.safeParse({ reviewer_id: validUUID });
    expect(result.success).toBe(false);
  });
});

describe('rejectReviewSchema', () => {
  it('valid input passes', () => {
    const result = rejectReviewSchema.safeParse({
      reviewer_id: validUUID,
      reason: 'Spam lead',
    });
    expect(result.success).toBe(true);
  });

  it('missing reviewer_id fails', () => {
    const result = rejectReviewSchema.safeParse({
      reason: 'Spam',
    });
    expect(result.success).toBe(false);
  });

  it('missing reason fails', () => {
    const result = rejectReviewSchema.safeParse({ reviewer_id: validUUID });
    expect(result.success).toBe(false);
  });
});

// ========================================================
// 6. bookingRequestSchema
// ========================================================
describe('bookingRequestSchema', () => {
  it('valid input passes', () => {
    const result = bookingRequestSchema.safeParse({
      patient_id: validUUID,
      requested_slot: '2025-03-15T10:00:00+00:00',
      duration_minutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it('invalid patient_id (non-UUID) fails', () => {
    const result = bookingRequestSchema.safeParse({
      patient_id: 'not-a-uuid',
      requested_slot: '2025-03-15T10:00:00+00:00',
    });
    expect(result.success).toBe(false);
  });

  it('invalid datetime format fails', () => {
    const result = bookingRequestSchema.safeParse({
      patient_id: validUUID,
      requested_slot: 'not-a-datetime',
    });
    expect(result.success).toBe(false);
  });

  it('datetime without timezone offset fails', () => {
    const result = bookingRequestSchema.safeParse({
      patient_id: validUUID,
      requested_slot: '2025-03-15T10:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('duration_minutes below minimum (15) fails', () => {
    const result = bookingRequestSchema.safeParse({
      patient_id: validUUID,
      requested_slot: '2025-03-15T10:00:00+00:00',
      duration_minutes: 10,
    });
    expect(result.success).toBe(false);
  });

  it('defaults duration_minutes to 30', () => {
    const result = bookingRequestSchema.safeParse({
      patient_id: validUUID,
      requested_slot: '2025-03-15T10:00:00+00:00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration_minutes).toBe(30);
    }
  });
});
