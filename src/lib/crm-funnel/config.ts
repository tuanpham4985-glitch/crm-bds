import type { LeadQualityRank } from '../types';

export const LEAD_SCORE_THRESHOLDS = Object.freeze({
  HOT: 80,
  QUALIFIED: 60,
  WARM: 40,
} as const);

export const LEAD_SCORE_WEIGHTS = Object.freeze({
  interaction: 10,
  projectProduct: 10,
  need: 10,
  budget: 10,
  purpose: 10,
  timeframe: 15,
  finance: 10,
  region: 5,
  interest: 15,
  nextAction: 5,
} as const);

export function rankForScore(score: number): LeadQualityRank {
  if (score >= LEAD_SCORE_THRESHOLDS.HOT) return 'HOT';
  if (score >= LEAD_SCORE_THRESHOLDS.QUALIFIED) return 'QUALIFIED';
  if (score >= LEAD_SCORE_THRESHOLDS.WARM) return 'WARM';
  return 'UNQUALIFIED';
}
