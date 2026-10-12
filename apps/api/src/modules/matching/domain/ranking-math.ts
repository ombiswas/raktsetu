/**
 * Decision & Ranking Optimization Math (Pure Functions, Zero I/O)
 * Lives strictly in Node API. Combines ML response probability with
 * distance decay and donor fatigue management.
 */

export type RequestUrgency = 'CRITICAL' | 'URGENT' | 'ROUTINE';

export interface RankingWeights {
  probabilityWeight: number; // Importance of P(response)
  distanceWeight: number;    // Distance penalty weight
  fatigueWeight: number;     // Recent alerts fatigue penalty weight
}

export const DEFAULT_RANKING_WEIGHTS: Record<RequestUrgency, RankingWeights> = {
  CRITICAL: {
    probabilityWeight: 0.55,
    distanceWeight: 0.35,
    fatigueWeight: 0.10
  },
  URGENT: {
    probabilityWeight: 0.45,
    distanceWeight: 0.35,
    fatigueWeight: 0.20
  },
  ROUTINE: {
    probabilityWeight: 0.35,
    distanceWeight: 0.35,
    fatigueWeight: 0.30
  }
};

export interface CandidateEvaluationParams {
  predictedProbability: number; // p ∈ [0, 1] from ML service
  distanceMeters: number;       // d >= 0
  maxRadiusMeters: number;      // d_max > 0
  recentAlertsCount: number;    // Notifications in last 7 days
  urgency: RequestUrgency;
  customWeights?: RankingWeights;
}

/**
 * Computes composite priority score in range [0, 1].
 * Higher score = higher priority in dispatch queue.
 *
 * S = w_p * p - w_d * (d / d_max) - w_f * min(alerts / 5, 1.0)
 * Scaled and clamped to [0, 1].
 */
export function computePriorityScore(params: CandidateEvaluationParams): number {
  const {
    predictedProbability,
    distanceMeters,
    maxRadiusMeters,
    recentAlertsCount,
    urgency,
    customWeights
  } = params;

  const weights = customWeights ?? DEFAULT_RANKING_WEIGHTS[urgency];

  // 1. Clamped probability in [0, 1]
  const clampedProb = Math.max(0, Math.min(1, predictedProbability));

  // 2. Normalized distance penalty [0, 1]
  const normalizedDistance =
    maxRadiusMeters > 0
      ? Math.max(0, Math.min(1, distanceMeters / maxRadiusMeters))
      : 0;

  // 3. Fatigue penalty: saturates at 5 alerts per week
  const maxAlertsBeforeMaxFatigue = 5;
  const fatigueRatio = Math.min(1, Math.max(0, recentAlertsCount / maxAlertsBeforeMaxFatigue));

  // Raw score formulation:
  // Base reward = probability
  // Penalties = normalized distance and fatigue
  const compositeScore =
    weights.probabilityWeight * clampedProb +
    weights.distanceWeight * (1 - normalizedDistance) +
    weights.fatigueWeight * (1 - fatigueRatio);

  const totalWeight =
    weights.probabilityWeight + weights.distanceWeight + weights.fatigueWeight;

  const normalizedScore = totalWeight > 0 ? compositeScore / totalWeight : clampedProb;

  return Math.max(0, Math.min(1, Number(normalizedScore.toFixed(4))));
}
