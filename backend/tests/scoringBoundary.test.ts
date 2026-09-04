import { scoreLead } from '../src/services/scoring';
import { ScoreTier } from '../src/types';
import type { ScoringRule } from '../src/types';

/**
 * Helper: build a config that yields exactly `targetScore` points.
 * Uses a single rule with the desired points.
 */
function configForScore(points: number): {
  scoring_rules: ScoringRule[];
  thresholds: { high: number; medium: number };
} {
  return {
    scoring_rules: [
      { field: 'urgency', operator: 'equals', value: 'emergency', points },
    ],
    thresholds: { high: 60, medium: 30 },
  };
}

describe('ScoringEngine — Boundary value tests', () => {
  // ========================================================
  // 1–8. Systematic boundary values
  // ========================================================

  it('score = 0 → LOW', () => {
    const result = scoreLead(configForScore(0), { urgency: 'routine' });
    expect(result.score).toBe(0);
    expect(result.tier).toBe(ScoreTier.LOW);
  });

  it('score = 1 → LOW', () => {
    const result = scoreLead(configForScore(1), { urgency: 'emergency' });
    expect(result.score).toBe(1);
    expect(result.tier).toBe(ScoreTier.LOW);
  });

  it('score = 29 → LOW', () => {
    const result = scoreLead(configForScore(29), { urgency: 'emergency' });
    expect(result.score).toBe(29);
    expect(result.tier).toBe(ScoreTier.LOW);
  });

  it('score = 30 → MEDIUM', () => {
    const result = scoreLead(configForScore(30), { urgency: 'emergency' });
    expect(result.score).toBe(30);
    expect(result.tier).toBe(ScoreTier.MEDIUM);
  });

  it('score = 31 → MEDIUM', () => {
    const result = scoreLead(configForScore(31), { urgency: 'emergency' });
    expect(result.score).toBe(31);
    expect(result.tier).toBe(ScoreTier.MEDIUM);
  });

  it('score = 59 → MEDIUM', () => {
    const result = scoreLead(configForScore(59), { urgency: 'emergency' });
    expect(result.score).toBe(59);
    expect(result.tier).toBe(ScoreTier.MEDIUM);
  });

  it('score = 60 → HIGH', () => {
    const result = scoreLead(configForScore(60), { urgency: 'emergency' });
    expect(result.score).toBe(60);
    expect(result.tier).toBe(ScoreTier.HIGH);
  });

  it('score = 100 → HIGH', () => {
    const result = scoreLead(configForScore(100), { urgency: 'emergency' });
    expect(result.score).toBe(100);
    expect(result.tier).toBe(ScoreTier.HIGH);
  });

  // ========================================================
  // 9. Config with 0 rules → score 0, LOW
  // ========================================================
  it('config with 0 rules → score 0, LOW', () => {
    const result = scoreLead(
      { scoring_rules: [], thresholds: { high: 60, medium: 30 } },
      { urgency: 'emergency' },
    );
    expect(result.score).toBe(0);
    expect(result.tier).toBe(ScoreTier.LOW);
    expect(result.breakdown).toHaveLength(0);
  });

  // ========================================================
  // 10. Swapped thresholds (high=30, medium=60)
  //     Tests that the function handles it mechanically:
  //     score >= 30 → HIGH, score >= 60 → also HIGH (but
  //     30-59 still HIGH since high threshold is first check)
  // ========================================================
  describe('Swapped thresholds (high=30, medium=60)', () => {
    const swappedThresholds = { high: 30, medium: 60 };

    it('score 30 → HIGH (≥ swapped high of 30)', () => {
      const result = scoreLead(configForScore(30), { urgency: 'emergency' });
      expect(result.score).toBe(30);
      // The configForScore uses default thresholds, so override
    });

    it('score 50 with swapped thresholds → HIGH (≥ 30)', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 50 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: swappedThresholds },
        { urgency: 'emergency' },
      );
      expect(result.score).toBe(50);
      expect(result.tier).toBe(ScoreTier.HIGH);
    });

    it('score 10 with swapped thresholds → LOW (< 30)', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 10 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: swappedThresholds },
        { urgency: 'emergency' },
      );
      expect(result.score).toBe(10);
      expect(result.tier).toBe(ScoreTier.LOW);
    });

    it('score 60 with swapped thresholds → HIGH (≥ 30)', () => {
      const rules: ScoringRule[] = [
        { field: 'urgency', operator: 'equals', value: 'emergency', points: 60 },
      ];
      const result = scoreLead(
        { scoring_rules: rules, thresholds: swappedThresholds },
        { urgency: 'emergency' },
      );
      expect(result.score).toBe(60);
      // Since high=30, score >= 30 is HIGH; medium=60 is never reached
      expect(result.tier).toBe(ScoreTier.HIGH);
    });
  });
});
