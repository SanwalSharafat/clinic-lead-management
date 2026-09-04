import {
  ScoreTier,
} from '../../types';
import type {
  ScoringRule,
  ScoreResult,
  RuleFired,
} from '../../types';

interface ScoreLeadConfig {
  scoring_rules: ScoringRule[];
  thresholds: { high: number; medium: number };
}

function fieldExists(fieldValue: unknown): boolean {
  return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function evaluateRule(rule: ScoringRule, extractedFields: Record<string, unknown>): boolean {
  const fieldValue = extractedFields[rule.field];
  const fieldPresent = rule.field in extractedFields;

  switch (rule.operator) {
    case 'exists': {
      if (typeof rule.value !== 'boolean') return false;
      if (rule.value === true) {
        return fieldPresent && fieldExists(fieldValue);
      }
      // rule.value === false: field must NOT exist or be empty/null/undefined
      return !fieldPresent || !fieldExists(fieldValue);
    }

    case 'equals': {
      if (!fieldPresent || !fieldExists(fieldValue)) return false;
      if (typeof rule.value === 'string' && typeof fieldValue === 'string') {
        return fieldValue.toLowerCase() === rule.value.toLowerCase();
      }
      return fieldValue === rule.value;
    }

    case 'not_equals': {
      if (!fieldPresent || !fieldExists(fieldValue)) return false;
      if (typeof rule.value === 'string' && typeof fieldValue === 'string') {
        return fieldValue.toLowerCase() !== rule.value.toLowerCase();
      }
      return fieldValue !== rule.value;
    }

    case 'greater_than': {
      if (!fieldPresent || !fieldExists(fieldValue)) return false;
      const fieldNum = toNumber(fieldValue);
      const ruleNum = toNumber(rule.value);
      if (fieldNum === null || ruleNum === null) return false;
      return fieldNum > ruleNum;
    }

    case 'less_than': {
      if (!fieldPresent || !fieldExists(fieldValue)) return false;
      const fieldNum = toNumber(fieldValue);
      const ruleNum = toNumber(rule.value);
      if (fieldNum === null || ruleNum === null) return false;
      return fieldNum < ruleNum;
    }

    case 'contains': {
      if (!fieldPresent || !fieldExists(fieldValue)) return false;
      const fieldStr = toString(fieldValue).toLowerCase();
      const ruleStr = toString(rule.value).toLowerCase();
      return fieldStr.includes(ruleStr);
    }

    default:
      return false;
  }
}

function determineTier(score: number, high: number, medium: number): ScoreTier {
  if (score >= high) return ScoreTier.HIGH;
  if (score >= medium) return ScoreTier.MEDIUM;
  return ScoreTier.LOW;
}

export function scoreLead(
  config: ScoreLeadConfig,
  extractedFields: Record<string, unknown>,
): ScoreResult {
  const breakdown: RuleFired[] = [];
  let totalScore = 0;

  for (const rule of config.scoring_rules) {
    const actualValue = rule.field in extractedFields ? extractedFields[rule.field] : undefined;
    const matched = evaluateRule(rule, extractedFields);

    breakdown.push({
      rule,
      matched,
      actual_value: actualValue,
    });

    if (matched) {
      totalScore += rule.points;
    }
  }

  const tier = determineTier(totalScore, config.thresholds.high, config.thresholds.medium);

  return {
    score: totalScore,
    tier,
    breakdown,
  };
}
