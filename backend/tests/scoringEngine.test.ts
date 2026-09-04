import { scoreLead } from '../src/services/scoring';
import { ScoreTier } from '../src/types';
import type { ScoringRule } from '../src/types';

const testConfig = {
  scoring_rules: [
    { field: 'urgency', operator: 'equals' as const, value: 'emergency', points: 40 },
    { field: 'urgency', operator: 'equals' as const, value: 'urgent', points: 25 },
    { field: 'new_or_returning', operator: 'equals' as const, value: 'new', points: 15 },
    { field: 'new_or_returning', operator: 'equals' as const, value: 'returning', points: 5 },
    { field: 'insurance', operator: 'exists' as const, value: true, points: 10 },
    { field: 'insurance', operator: 'not_equals' as const, value: 'none', points: 5 },
    { field: 'age', operator: 'greater_than' as const, value: 18, points: 5 },
    { field: 'urgency_level', operator: 'less_than' as const, value: 3, points: 5 },
    { field: 'reason_for_visit', operator: 'contains' as const, value: 'implant', points: 20 },
  ] as ScoringRule[],
  thresholds: { high: 60, medium: 30 },
};

describe('ScoringEngine — scoreLead()', () => {
  // ========================================================
  // 1. HIGH score: emergency + new + insurance = 65
  // ========================================================
  describe('HIGH score scenario', () => {
    it('emergency + new + insurance = 70pts ≥ 60 → HIGH, breakdown has 4 matched rules', () => {
      const fields = {
        urgency: 'emergency',
        new_or_returning: 'new',
        insurance: 'Delta Dental',
      };

      const result = scoreLead(testConfig, fields);

      // emergency(40) + new(15) + insurance exists(10) + insurance not_equals none(5) = 70
      expect(result.score).toBe(70);
      expect(result.tier).toBe(ScoreTier.HIGH);

      // Verify breakdown has all 4 rules matched
      const matched = result.breakdown.filter((b) => b.matched);
      expect(matched).toHaveLength(4);

      const matchedFields = matched.map((b) => b.rule.field);
      expect(matchedFields).toContain('urgency');
      expect(matchedFields).toContain('new_or_returning');
      expect(matchedFields).toContain('insurance');
    });
  });

  // ========================================================
  // 2. MEDIUM score: routine + returning + insurance
  // ========================================================
  describe('MEDIUM score scenario', () => {
    it('routine + returning + Cigna insurance = 15pts → LOW (below 30 threshold)', () => {
      const fields = {
        urgency: 'routine',
        new_or_returning: 'returning',
        insurance: 'Cigna',
      };

      const result = scoreLead(testConfig, fields);

      // returning(5) + insurance exists(10) + insurance not_equals none(5) = 20
      expect(result.score).toBe(20);
      expect(result.tier).toBe(ScoreTier.LOW);
    });

    it('urgent + returning + insurance = 40pts → MEDIUM', () => {
      const fields = {
        urgency: 'urgent',
        new_or_returning: 'returning',
        insurance: 'Aetna',
      };

      const result = scoreLead(testConfig, fields);

      // urgent(25) + returning(5) + insurance exists(10) + insurance not_equals none(5) = 45
      expect(result.score).toBe(45);
      expect(result.tier).toBe(ScoreTier.MEDIUM);
    });
  });

  // ========================================================
  // 3. LOW score: routine + returning + no insurance
  // ========================================================
  describe('LOW score scenario', () => {
    it('routine + returning + insurance=none = 5pts → LOW', () => {
      const fields = {
        urgency: 'routine',
        new_or_returning: 'returning',
        insurance: 'none',
      };

      const result = scoreLead(testConfig, fields);

      // returning(5) + insurance exists=true (field 'none' is truthy for exists)(10) + insurance not_equals none=false = 15
      expect(result.score).toBe(15);
      expect(result.tier).toBe(ScoreTier.LOW);
    });
  });

  // ========================================================
  // 4. Boundary: exactly 60, 30, 29
  // ========================================================
  describe('Boundary values', () => {
    it('score exactly 60 → HIGH', () => {
      // emergency(40) + new(15) + exists(10) − we need exactly 60
      // emergency(40) + returning(5) + exists(10) + not_equals none(5) = 60
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 40 },
        { field: 'new_or_returning', operator: 'equals', value: 'returning', points: 5 },
        { field: 'insurance', operator: 'exists', value: true, points: 10 },
        { field: 'insurance', operator: 'not_equals', value: 'none', points: 5 },
      ];
      const fields = {
        urgency: 'emergency',
        new_or_returning: 'returning',
        insurance: 'Delta Dental',
      };
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        fields,
      );
      expect(result.score).toBe(60);
      expect(result.tier).toBe(ScoreTier.HIGH);
    });

    it('score exactly 30 → MEDIUM', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'urgent', points: 25 },
        { field: 'insurance', operator: 'exists', value: true, points: 5 },
      ];
      const fields = { urgency: 'urgent', insurance: 'Aetna' };
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        fields,
      );
      expect(result.score).toBe(30);
      expect(result.tier).toBe(ScoreTier.MEDIUM);
    });

    it('score 29 → LOW', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'urgent', points: 25 },
        { field: 'insurance', operator: 'exists', value: true, points: 4 },
      ];
      const fields = { urgency: 'urgent', insurance: 'Aetna' };
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        fields,
      );
      expect(result.score).toBe(29);
      expect(result.tier).toBe(ScoreTier.LOW);
    });
  });

  // ========================================================
  // 5. All 6 operators: matching and non-matching
  // ========================================================
  describe('All 6 operators', () => {
    it('equals: matches when values are equal (case-insensitive)', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'EMERGENCY', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: 'emergency' },
      );
      expect(result.score).toBe(10);
      expect(result.breakdown[0]!.matched).toBe(true);
    });

    it('equals: does NOT match when values differ', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: 'routine' },
      );
      expect(result.score).toBe(0);
      expect(result.breakdown[0]!.matched).toBe(false);
    });

    it('not_equals: matches when values differ (case-insensitive)', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'not_equals', value: 'routine', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: 'EMERGENCY' },
      );
      expect(result.score).toBe(10);
      expect(result.breakdown[0]!.matched).toBe(true);
    });

    it('not_equals: does NOT match when values are equal', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'not_equals', value: 'routine', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: 'routine' },
      );
      expect(result.score).toBe(0);
      expect(result.breakdown[0]!.matched).toBe(false);
    });

    it('greater_than: matches when field > value', () => {
      const rules: ScoringRule[] = [
        { field: 'age', operator: 'greater_than', value: 18, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { age: 25 },
      );
      expect(result.score).toBe(10);
    });

    it('greater_than: does NOT match when field = value', () => {
      const rules: ScoringRule[] = [
        { field: 'age', operator: 'greater_than', value: 18, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { age: 18 },
      );
      expect(result.score).toBe(0);
    });

    it('less_than: matches when field < value', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency_level', operator: 'less_than', value: 3, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency_level: 1 },
      );
      expect(result.score).toBe(10);
    });

    it('less_than: does NOT match when field ≥ value', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency_level', operator: 'less_than', value: 3, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency_level: 3 },
      );
      expect(result.score).toBe(0);
    });

    it('contains: matches when field includes substring (case-insensitive)', () => {
      const rules: ScoringRule[] = [
        { field: 'reason_for_visit', operator: 'contains', value: 'IMPLANT', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { reason_for_visit: 'I want a dental implant' },
      );
      expect(result.score).toBe(10);
    });

    it('contains: does NOT match when substring not present', () => {
      const rules: ScoringRule[] = [
        { field: 'reason_for_visit', operator: 'contains', value: 'implant', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { reason_for_visit: 'routine cleaning' },
      );
      expect(result.score).toBe(0);
    });

    it('exists (true): matches when field present and non-empty', () => {
      const rules: ScoringRule[] = [
        { field: 'insurance', operator: 'exists', value: true, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { insurance: 'Delta Dental' },
      );
      expect(result.score).toBe(10);
    });

    it('exists (true): does NOT match when field missing', () => {
      const rules: ScoringRule[] = [
        { field: 'insurance', operator: 'exists', value: true, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { name: 'John' },
      );
      expect(result.score).toBe(0);
    });

    it('exists (false): matches when field missing or empty', () => {
      const rules: ScoringRule[] = [
        { field: 'insurance', operator: 'exists', value: false, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { name: 'John' },
      );
      expect(result.score).toBe(10);
    });

    it('exists (false): does NOT match when field present', () => {
      const rules: ScoringRule[] = [
        { field: 'insurance', operator: 'exists', value: false, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { insurance: 'Aetna' },
      );
      expect(result.score).toBe(0);
    });
  });

  // ========================================================
  // 6. Missing field: no crash
  // ========================================================
  describe('Missing field handling', () => {
    it('rule references nonexistent_field → no match, no crash', () => {
      const rules: ScoringRule[] = [
        { field: 'nonexistent_field', operator: 'equals', value: 'test', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: 'emergency' },
      );
      expect(result.score).toBe(0);
      expect(result.breakdown[0]!.matched).toBe(false);
      expect(result.breakdown[0]!.actual_value).toBeUndefined();
    });
  });

  // ========================================================
  // 7. Null field value
  // ========================================================
  describe('Null field values', () => {
    it('null field value does not match equals', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: null },
      );
      expect(result.score).toBe(0);
      expect(result.breakdown[0]!.matched).toBe(false);
    });

    it('undefined field value does not match equals', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: undefined },
      );
      expect(result.score).toBe(0);
      expect(result.breakdown[0]!.matched).toBe(false);
    });

    it('empty string field value does not match equals', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { urgency: '' },
      );
      expect(result.score).toBe(0);
      expect(result.breakdown[0]!.matched).toBe(false);
    });

    it('null field matches exists(false)', () => {
      const rules: ScoringRule[] = [
        { field: 'insurance', operator: 'exists', value: false, points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        { insurance: null },
      );
      expect(result.score).toBe(10);
    });
  });

  // ========================================================
  // 8. Breakdown includes actual_value for each rule
  // ========================================================
  describe('Breakdown actual_value', () => {
    it('breakdown has actual_value for each rule entry', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 40 },
        { field: 'insurance', operator: 'exists', value: true, points: 10 },
        { field: 'missing_field', operator: 'equals', value: 'x', points: 5 },
      ];
      const fields = {
        urgency: 'emergency',
        insurance: 'Delta Dental',
      };
      const result = scoreLead(
        { scoring_rules: rules, thresholds: { high: 60, medium: 30 } },
        fields,
      );

      expect(result.breakdown).toHaveLength(3);
      expect(result.breakdown[0]!.actual_value).toBe('emergency');
      expect(result.breakdown[1]!.actual_value).toBe('Delta Dental');
      expect(result.breakdown[2]!.actual_value).toBeUndefined();

      // Matched rules
      expect(result.breakdown[0]!.matched).toBe(true);
      expect(result.breakdown[1]!.matched).toBe(true);
      expect(result.breakdown[2]!.matched).toBe(false);
    });
  });
});
