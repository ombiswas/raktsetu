/**
 * Hybrid Ranker
 * Combines ML Response Probability P(response) with Geospatial Accessibility.
 * Pure mathematical functions, zero I/O.
 * Hard biological constraints, eligibility, and availability are applied upstream.
 *
 * Scoring Function:
 * score = w_p(urgency) * P + w_a(urgency) * accessibility
 * where:
 * accessibility = 1 - min(distance / maxRadius, 1) (or from travel time when available)
 */

import type {
  DonorRanker,
  CandidateForRanking,
  RankedCandidate,
  RankingRequest,
  RankingContext
} from './ranker.js';

export interface HybridWeightsConfig {
  readonly version: string;
  readonly critical: { readonly weightProbability: number; readonly weightAccessibility: number };
  readonly urgent: { readonly weightProbability: number; readonly weightAccessibility: number };
  readonly standard: { readonly weightProbability: number; readonly weightAccessibility: number };
  readonly nominalMaxRadiusMeters: number;
  readonly nominalMaxTravelSeconds?: number;
}

export const DEFAULT_HYBRID_WEIGHTS: HybridWeightsConfig = {
  version: 'v1.0.0-hybrid',
  // Critical trauma emergencies weight physical accessibility higher
  critical: { weightProbability: 0.35, weightAccessibility: 0.65 },
  // Urgent requests balance likelihood and transit distance equally
  urgent: { weightProbability: 0.50, weightAccessibility: 0.50 },
  // Routine / elective requests prioritize predicted response probability to reduce alert fatigue
  standard: { weightProbability: 0.70, weightAccessibility: 0.30 },
  nominalMaxRadiusMeters: 50000, // 50 km nominal boundary
  nominalMaxTravelSeconds: 3600  // 60 minutes nominal transit
};

export class HybridRanker implements DonorRanker {
  public readonly algorithm = 'hybrid' as const;
  public readonly algorithmVersion: string;

  constructor(private readonly config: HybridWeightsConfig = DEFAULT_HYBRID_WEIGHTS) {
    this.algorithmVersion = this.config.version;
  }

  public rank(
    candidates: CandidateForRanking[],
    request: RankingRequest,
    _context?: RankingContext
  ): RankedCandidate[] {
    // 1. Resolve weights based on request urgency
    const urgencyKey = (request.urgency ?? 'standard').toLowerCase();
    const weightConfig =
      urgencyKey === 'critical'
        ? this.config.critical
        : urgencyKey === 'urgent'
          ? this.config.urgent
          : this.config.standard;

    const { weightProbability: wp, weightAccessibility: wa } = weightConfig;

    // 2. Score each candidate
    const scoredCandidates = candidates.map((candidate) => {
      // P(response): use provided predicted probability, or default prior 0.3
      const rawP = typeof candidate.pResponse === 'number' ? candidate.pResponse : 0.3;
      const P = Math.max(0, Math.min(1, rawP));

      // Accessibility: from travel time if available, otherwise geodesic distance
      let accessibility: number;
      if (
        typeof candidate.travelSeconds === 'number' &&
        candidate.travelSeconds > 0 &&
        this.config.nominalMaxTravelSeconds
      ) {
        const ratio = candidate.travelSeconds / this.config.nominalMaxTravelSeconds;
        accessibility = Math.max(0, 1 - Math.min(1, ratio));
      } else {
        const ratio = candidate.distanceMeters / this.config.nominalMaxRadiusMeters;
        accessibility = Math.max(0, 1 - Math.min(1, ratio));
      }

      // Linear combination clamped in [0, 1]
      const rawScore = wp * P + wa * accessibility;
      const score = Math.max(0, Math.min(1, Number(rawScore.toFixed(4))));

      return {
        donorId: candidate.donorId,
        score,
        distanceMeters: candidate.distanceMeters,
        travelSeconds: candidate.travelSeconds ?? null,
        pResponse: typeof candidate.pResponse === 'number' ? candidate.pResponse : null
      };
    });

    // 3. Deterministic Sorting:
    // 1) Score descending
    // 2) Distance ascending
    // 3) Donor ID lexical sort
    const sorted = scoredCandidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
      }
      return a.donorId.localeCompare(b.donorId);
    });

    // 4. Assign 1-indexed ranks
    return sorted.map((c, index) => ({
      donorId: c.donorId,
      rank: index + 1,
      score: c.score,
      distanceMeters: c.distanceMeters,
      travelSeconds: c.travelSeconds,
      pResponse: c.pResponse
    }));
  }
}
