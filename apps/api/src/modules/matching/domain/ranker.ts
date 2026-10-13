/**
 * Donor Ranker Domain Interface & Proximity Baseline
 * Pure functions, zero I/O.
 */

import type { BloodGroup } from './compatibility.js';

export interface CandidateForRanking {
  donorId: string;
  distanceMeters: number;
  lastRespondedAt?: Date | null;
  bloodGroup: BloodGroup;
  travelSeconds?: number | null;
  [key: string]: unknown;
}

export interface RankedCandidate {
  donorId: string;
  rank: number; // 1-indexed (1, 2, 3...)
  score: number;
  distanceMeters: number;
  pResponse?: number | null;
  travelSeconds?: number | null;
}

export interface RankingRequest {
  id: string;
  bloodGroup: BloodGroup;
  component: string;
  urgency: string;
  [key: string]: unknown;
}

export interface RankingContext {
  asOfDate?: Date;
  [key: string]: unknown;
}

export interface DonorRanker {
  readonly algorithm: 'baseline' | 'hybrid';
  readonly algorithmVersion: string;
  rank(
    candidates: CandidateForRanking[],
    request: RankingRequest,
    context?: RankingContext
  ): RankedCandidate[];
}

/**
 * Baseline Proximity Ranker.
 * Orders candidates strictly by ascending geodesic distance.
 * Deterministic tie-breaking rules:
 * 1. Ascending distance (closer first)
 * 2. Last response recency (more recent response first; responded donors over non-responded)
 * 3. Donor ID lexical order (guarantees 100% deterministic ordering)
 */
export class ProximityRanker implements DonorRanker {
  public readonly algorithm = 'baseline' as const;
  public readonly algorithmVersion = 'v1.0.0-baseline';

  public rank(
    candidates: CandidateForRanking[],
    _request: RankingRequest,
    _context?: RankingContext
  ): RankedCandidate[] {
    // Clone array to avoid mutating caller's collection
    const sorted = [...candidates].sort((a, b) => {
      // 1. Distance ascending
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
      }

      // 2. Tie-break: Last response recency (more recent timestamp first)
      const timeA = a.lastRespondedAt ? a.lastRespondedAt.getTime() : 0;
      const timeB = b.lastRespondedAt ? b.lastRespondedAt.getTime() : 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }

      // 3. Tie-break: Donor ID lexical sort
      return a.donorId.localeCompare(b.donorId);
    });

    return sorted.map((candidate, index) => {
      // Linear proximity score clamped in [0, 1] relative to nominal 50 km horizon
      const rawScore = 1 - candidate.distanceMeters / 50000;
      const score = Math.max(0, Math.min(1, Number(rawScore.toFixed(4))));

      return {
        donorId: candidate.donorId,
        rank: index + 1,
        score,
        distanceMeters: candidate.distanceMeters,
        travelSeconds: candidate.travelSeconds ?? null,
        pResponse: null
      };
    });
  }
}
