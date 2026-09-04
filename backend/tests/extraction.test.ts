import { aiExtractionSchema } from '../src/validators/schemas';

describe('AI Extraction Schema Validation', () => {
  // ========================================================
  // 1. Valid AI output passes Zod validation
  // ========================================================
  describe('Valid inputs', () => {
    it('accepts a fully valid AI extraction output', () => {
      const input = {
        extracted_fields: {
          urgency: 'emergency',
          insurance: 'Delta Dental',
          new_or_returning: 'new',
        },
        answer: 'We can help with your emergency!',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.92,
        missing_required_fields: ['preferred_date'],
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extracted_fields).toEqual(input.extracted_fields);
        expect(result.data.answer).toBe(input.answer);
        expect(result.data.is_clinical_question).toBe(false);
        expect(result.data.is_ambiguous).toBe(false);
        expect(result.data.confidence).toBe(0.92);
        expect(result.data.missing_required_fields).toEqual(['preferred_date']);
      }
    });

    it('accepts with empty extracted_fields and empty missing_required_fields', () => {
      const input = {
        extracted_fields: {},
        answer: 'Thank you for reaching out.',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.8,
        missing_required_fields: [],
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('defaults extracted_fields to {} and missing_required_fields to [] when omitted', () => {
      const input = {
        answer: 'Hello!',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.7,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extracted_fields).toEqual({});
        expect(result.data.missing_required_fields).toEqual([]);
      }
    });
  });

  // ========================================================
  // 2. Invalid AI JSON rejected by Zod
  // ========================================================
  describe('Invalid inputs', () => {
    it('rejects missing required field "answer"', () => {
      const input = {
        extracted_fields: {},
        // answer missing
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.8,
        missing_required_fields: [],
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects missing "is_clinical_question"', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        // is_clinical_question missing
        is_ambiguous: false,
        confidence: 0.8,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects wrong type for confidence (string instead of number)', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 'high', // wrong type
        missing_required_fields: [],
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects wrong type for is_clinical_question (string instead of boolean)', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: 'yes', // wrong type
        is_ambiguous: false,
        confidence: 0.8,
        missing_required_fields: [],
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects missing "is_ambiguous"', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        // is_ambiguous missing
        confidence: 0.8,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ========================================================
  // 3. Low confidence (< 0.5) is correctly identified
  // ========================================================
  describe('Confidence threshold', () => {
    it('accepts confidence of exactly 0.49 (below 0.5 threshold — schema allows it)', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.49,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        // The caller (workflow) checks confidence < 0.5, not the schema.
        // But we verify the schema passes the value through correctly.
        expect(result.data.confidence).toBe(0.49);
        const isLowConfidence = result.data.confidence < 0.5;
        expect(isLowConfidence).toBe(true);
      }
    });

    it('accepts confidence of exactly 0.5 (boundary)', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.5,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        const isLowConfidence = result.data.confidence < 0.5;
        expect(isLowConfidence).toBe(false);
      }
    });
  });

  // ========================================================
  // 4. is_clinical_question flag preserved
  // ========================================================
  describe('is_clinical_question preservation', () => {
    it('preserves is_clinical_question = true', () => {
      const input = {
        extracted_fields: {},
        answer: 'I cannot answer clinical questions.',
        is_clinical_question: true,
        is_ambiguous: false,
        confidence: 0.95,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_clinical_question).toBe(true);
      }
    });

    it('preserves is_clinical_question = false', () => {
      const input = {
        extracted_fields: { name: 'John' },
        answer: 'We have availability tomorrow.',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.9,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_clinical_question).toBe(false);
      }
    });
  });

  // ========================================================
  // 5. is_ambiguous flag preserved
  // ========================================================
  describe('is_ambiguous preservation', () => {
    it('preserves is_ambiguous = true', () => {
      const input = {
        extracted_fields: {},
        answer: 'Could you clarify?',
        is_clinical_question: false,
        is_ambiguous: true,
        confidence: 0.5,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_ambiguous).toBe(true);
      }
    });

    it('preserves is_ambiguous = false', () => {
      const input = {
        extracted_fields: { urgency: 'routine' },
        answer: 'Got it, routine checkup.',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.95,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_ambiguous).toBe(false);
      }
    });
  });

  // ========================================================
  // 6. missing_required_fields array populated correctly
  // ========================================================
  describe('missing_required_fields', () => {
    it('populates the array with string values', () => {
      const input = {
        extracted_fields: {},
        answer: 'Please provide more info.',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0.7,
        missing_required_fields: ['name', 'preferred_date', 'insurance'],
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.missing_required_fields).toEqual([
          'name',
          'preferred_date',
          'insurance',
        ]);
      }
    });

    it('defaults to empty array when not provided', () => {
      const input = {
        extracted_fields: {},
        answer: 'All info received.',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 1.0,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.missing_required_fields).toEqual([]);
      }
    });
  });

  // ========================================================
  // 7. Confidence clamped to 0-1 range
  // ========================================================
  describe('Confidence range clamping', () => {
    it('rejects confidence > 1', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 1.5,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects confidence < 0', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: -0.1,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts confidence of exactly 0', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 0,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts confidence of exactly 1', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: 1,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects confidence as NaN', () => {
      const input = {
        extracted_fields: {},
        answer: 'Hello',
        is_clinical_question: false,
        is_ambiguous: false,
        confidence: NaN,
      };

      const result = aiExtractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
