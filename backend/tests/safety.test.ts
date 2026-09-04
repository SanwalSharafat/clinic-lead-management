import { aiExtractionSchema } from '../src/validators/schemas';

// ========================================================
// Opt-out detection function (mirrors production logic)
// ========================================================
function isOptOutCommand(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const exactMatches = ['stop', 'unsubscribe', 'opt out', 'opt-out', 'cancel subscription', 'do not contact'];
  return exactMatches.includes(normalized) || normalized.startsWith('stop ') || normalized.startsWith('please stop');
}

// ========================================================
// AI Extraction schema — clinical question validation
// ========================================================
describe('aiExtractionSchema — clinical question handling', () => {
  it('valid clinical result with is_clinical_question: true passes', () => {
    const result = aiExtractionSchema.safeParse({
      extracted_fields: { urgency: 'emergency' },
      answer: 'You should see a dentist immediately.',
      is_clinical_question: true,
      is_ambiguous: false,
      confidence: 0.9,
      missing_required_fields: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_clinical_question).toBe(true);
    }
  });

  it('valid non-clinical result passes', () => {
    const result = aiExtractionSchema.safeParse({
      extracted_fields: { urgency: 'routine', new_or_returning: 'new' },
      answer: 'We have availability next Tuesday.',
      is_clinical_question: false,
      is_ambiguous: false,
      confidence: 0.85,
      missing_required_fields: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_clinical_question).toBe(false);
    }
  });

  it('validator correctly preserves boolean flags', () => {
    const result = aiExtractionSchema.safeParse({
      extracted_fields: {},
      answer: 'Test answer',
      is_clinical_question: true,
      is_ambiguous: true,
      confidence: 0.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.is_clinical_question).toBe('boolean');
      expect(typeof result.data.is_ambiguous).toBe('boolean');
      expect(result.data.is_clinical_question).toBe(true);
      expect(result.data.is_ambiguous).toBe(true);
    }
  });

  it('ambiguous flag is preserved as false', () => {
    const result = aiExtractionSchema.safeParse({
      extracted_fields: {},
      answer: 'Clear answer',
      is_clinical_question: false,
      is_ambiguous: false,
      confidence: 0.9,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_ambiguous).toBe(false);
    }
  });

  it('confidence is clamped to [0, 1] — value > 1 fails', () => {
    const result = aiExtractionSchema.safeParse({
      extracted_fields: {},
      answer: 'test',
      is_clinical_question: false,
      is_ambiguous: false,
      confidence: 1.2,
    });
    expect(result.success).toBe(false);
  });

  it('confidence is clamped to [0, 1] — value < 0 fails', () => {
    const result = aiExtractionSchema.safeParse({
      extracted_fields: {},
      answer: 'test',
      is_clinical_question: false,
      is_ambiguous: false,
      confidence: -0.01,
    });
    expect(result.success).toBe(false);
  });

  it('confidence at exact boundaries 0 and 1 passes', () => {
    const r0 = aiExtractionSchema.safeParse({
      extracted_fields: {},
      answer: 'test',
      is_clinical_question: false,
      is_ambiguous: false,
      confidence: 0,
    });
    expect(r0.success).toBe(true);

    const r1 = aiExtractionSchema.safeParse({
      extracted_fields: {},
      answer: 'test',
      is_clinical_question: false,
      is_ambiguous: false,
      confidence: 1,
    });
    expect(r1.success).toBe(true);
  });
});

// ========================================================
// Opt-out keyword detection
// ========================================================
describe('isOptOutCommand', () => {
  it('"stop" → true', () => {
    expect(isOptOutCommand('stop')).toBe(true);
  });

  it('"unsubscribe" → true', () => {
    expect(isOptOutCommand('unsubscribe')).toBe(true);
  });

  it('"the pain won\'t stop" → false (embedded word)', () => {
    expect(isOptOutCommand("the pain won't stop")).toBe(false);
  });

  it('"please stop" → true', () => {
    expect(isOptOutCommand('please stop')).toBe(true);
  });

  it('"STOP" (uppercase) → true', () => {
    expect(isOptOutCommand('STOP')).toBe(true);
  });

  it('"opt out" → true', () => {
    expect(isOptOutCommand('opt out')).toBe(true);
  });

  it('"opt-out" → true', () => {
    expect(isOptOutCommand('opt-out')).toBe(true);
  });

  it('"cancel subscription" → true', () => {
    expect(isOptOutCommand('cancel subscription')).toBe(true);
  });

  it('"do not contact" → true', () => {
    expect(isOptOutCommand('do not contact')).toBe(true);
  });

  it('"stop it" → true (starts with "stop ")', () => {
    expect(isOptOutCommand('stop it')).toBe(true);
  });

  it('"I want to stop" → false (does not start with stop)', () => {
    expect(isOptOutCommand('I want to stop')).toBe(false);
  });

  it('"please stop bothering me" → true (starts with "please stop")', () => {
    expect(isOptOutCommand('please stop bothering me')).toBe(true);
  });

  it('"hello world" → false', () => {
    expect(isOptOutCommand('hello world')).toBe(false);
  });
});
