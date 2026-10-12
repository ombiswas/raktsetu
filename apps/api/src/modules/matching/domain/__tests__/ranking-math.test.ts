import { describe, it, expect } from 'vitest';
import {
  computePriorityScore,
  DEFAULT_RANKING_WEIGHTS
} from '../ranking-math.js';

describe('Ranking Optimization Math Domain (Pure Logic)', () => {
  it('computes expected score bounds in [0, 1]', () => {
    const perfectCandidate = computePriorityScore({
      predictedProbability: 1.0,
      distanceMeters: 0,
      maxRadiusMeters: 10000,
      recentAlertsCount: 0,
      urgency: 'CRITICAL'
    });
    expect(perfectCandidate).toBeCloseTo(1.0, 2);

    const worstCandidate = computePriorityScore({
      predictedProbability: 0.0,
      distanceMeters: 10000,
      maxRadiusMeters: 10000,
      recentAlertsCount: 10,
      urgency: 'CRITICAL'
    });
    expect(worstCandidate).toBeCloseTo(0.0, 2);
  });

  it('penalizes candidates further away given equal response probability', () => {
    const nearScore = computePriorityScore({
      predictedProbability: 0.8,
      distanceMeters: 1000,
      maxRadiusMeters: 10000,
      recentAlertsCount: 0,
      urgency: 'URGENT'
    });

    const farScore = computePriorityScore({
      predictedProbability: 0.8,
      distanceMeters: 9000,
      maxRadiusMeters: 10000,
      recentAlertsCount: 0,
      urgency: 'URGENT'
    });

    expect(nearScore).toBeGreaterThan(farScore);
  });

  it('penalizes fatigued donors with high recent alerts', () => {
    const restedDonor = computePriorityScore({
      predictedProbability: 0.7,
      distanceMeters: 3000,
      maxRadiusMeters: 10000,
      recentAlertsCount: 0,
      urgency: 'ROUTINE'
    });

    const fatiguedDonor = computePriorityScore({
      predictedProbability: 0.7,
      distanceMeters: 3000,
      maxRadiusMeters: 10000,
      recentAlertsCount: 5,
      urgency: 'ROUTINE'
    });

    expect(restedDonor).toBeGreaterThan(fatiguedDonor);
  });

  it('gives higher weight to response probability under CRITICAL urgency than ROUTINE', () => {
    expect(DEFAULT_RANKING_WEIGHTS.CRITICAL.probabilityWeight).toBeGreaterThan(
      DEFAULT_RANKING_WEIGHTS.ROUTINE.probabilityWeight
    );
  });
});
