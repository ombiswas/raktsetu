import { describe, it, expect } from 'vitest';
import { HybridRanker, DEFAULT_HYBRID_WEIGHTS } from '../hybrid-ranker.js';
import type { CandidateForRanking, RankingRequest } from '../ranker.js';

describe('HybridRanker (Domain Scoring & Ranking)', () => {
  const ranker = new HybridRanker(DEFAULT_HYBRID_WEIGHTS);

  const requestCritical: RankingRequest = {
    id: 'req-1',
    bloodGroup: 'O+',
    component: 'whole_blood',
    urgency: 'critical',
    unitsRequired: 2,
    neededBy: new Date('2026-10-15T00:00:00Z')
  };

  const requestStandard: RankingRequest = {
    id: 'req-2',
    bloodGroup: 'O+',
    component: 'whole_blood',
    urgency: 'standard',
    unitsRequired: 1,
    neededBy: new Date('2026-10-18T00:00:00Z')
  };

  it('weights physical accessibility higher in critical trauma emergencies', () => {
    // Candidate A: very close (1 km, accessibility = 1 - 1000/50000 = 0.98), but moderate P (0.5)
    // Critical score: 0.35 * 0.5 + 0.65 * 0.98 = 0.175 + 0.637 = 0.812
    const candidateA: CandidateForRanking = {
      donorId: 'donor-close',
      bloodGroup: 'O+',
      distanceMeters: 1000,
      pResponse: 0.5
    };

    // Candidate B: far away (25 km, accessibility = 1 - 25000/50000 = 0.5), but high P (0.9)
    // Critical score: 0.35 * 0.9 + 0.65 * 0.5 = 0.315 + 0.325 = 0.640
    const candidateB: CandidateForRanking = {
      donorId: 'donor-far',
      bloodGroup: 'O+',
      distanceMeters: 25000,
      pResponse: 0.9
    };

    const ranked = ranker.rank([candidateB, candidateA], requestCritical);

    // In critical urgency, the close donor MUST rank first because wa = 0.65 > wp = 0.35
    expect(ranked[0]!.donorId).toBe('donor-close');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[0]!.score).toBeCloseTo(0.812, 3);

    expect(ranked[1]!.donorId).toBe('donor-far');
    expect(ranked[1]!.rank).toBe(2);
    expect(ranked[1]!.score).toBeCloseTo(0.64, 3);
  });

  it('prioritizes response probability in routine/standard requests to minimize alert fatigue', () => {
    // Candidate A: 1 km, P = 0.5.
    // Standard score: 0.70 * 0.5 + 0.30 * 0.98 = 0.35 + 0.294 = 0.644
    const candidateA: CandidateForRanking = {
      donorId: 'donor-close',
      bloodGroup: 'O+',
      distanceMeters: 1000,
      pResponse: 0.5
    };

    // Candidate B: 25 km, P = 0.9.
    // Standard score: 0.70 * 0.9 + 0.30 * 0.5 = 0.63 + 0.15 = 0.780
    const candidateB: CandidateForRanking = {
      donorId: 'donor-far',
      bloodGroup: 'O+',
      distanceMeters: 25000,
      pResponse: 0.9
    };

    const ranked = ranker.rank([candidateA, candidateB], requestStandard);

    // In standard urgency, Candidate B ranks first because wp = 0.70 > wa = 0.30
    expect(ranked[0]!.donorId).toBe('donor-far');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[0]!.score).toBeCloseTo(0.78, 3);

    expect(ranked[1]!.donorId).toBe('donor-close');
    expect(ranked[1]!.rank).toBe(2);
    expect(ranked[1]!.score).toBeCloseTo(0.644, 3);
  });

  it('uses travelSeconds for accessibility when available', () => {
    // nominalMaxTravelSeconds = 3600s (60 min)
    // 900s (15 min) -> accessibility = 1 - 900/3600 = 0.75
    // P = 0.8
    // Critical: 0.35 * 0.8 + 0.65 * 0.75 = 0.28 + 0.4875 = 0.7675
    const candidateWithTravel: CandidateForRanking = {
      donorId: 'donor-transit',
      bloodGroup: 'O+',
      distanceMeters: 15000,
      travelSeconds: 900,
      pResponse: 0.8
    };

    const ranked = ranker.rank([candidateWithTravel], requestCritical);

    expect(ranked[0]!.score).toBeCloseTo(0.7675, 3);
    expect(ranked[0]!.travelSeconds).toBe(900);
  });

  it('breaks ties deterministically by distance ascending and donorId ascending', () => {
    const candidate1: CandidateForRanking = {
      donorId: 'donor-z',
      bloodGroup: 'O+',
      distanceMeters: 5000,
      pResponse: 0.7
    };
    const candidate2: CandidateForRanking = {
      donorId: 'donor-a',
      bloodGroup: 'O+',
      distanceMeters: 5000,
      pResponse: 0.7
    };

    const ranked = ranker.rank([candidate1, candidate2], requestCritical);

    // Identical score and distance -> sorted by donorId alphabetically
    expect(ranked[0]!.donorId).toBe('donor-a');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[1]!.donorId).toBe('donor-z');
    expect(ranked[1]!.rank).toBe(2);
  });
});
