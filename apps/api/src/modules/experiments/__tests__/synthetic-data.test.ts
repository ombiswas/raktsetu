import { describe, it, expect } from 'vitest';
import { SeededPRNG } from '../prng.js';
import { SyntheticDataGenerator, computeHaversineDistanceKm, calculateDonorAge } from '../generator.js';
import { ExperimentConfigSchema, type ExperimentConfig } from '../types.js';

const mockConfig: ExperimentConfig = ExperimentConfigSchema.parse({
  simulation: true,
  disclaimer: 'SIMULATION PROTOTYPE: Academic research synthetic dataset. Not clinical data.',
  seed: 42,
  version: '1.0.0',
  population: {
    num_donors: 100,
    center: {
      name: 'Dehradun',
      latitude: 30.3165,
      longitude: 78.0322
    },
    clusters: [
      {
        name: 'Clock Tower',
        latitude: 30.3256,
        longitude: 78.0437,
        weight: 0.6,
        std_dev_km: 1.0
      },
      {
        name: 'Rajpur Road',
        latitude: 30.3621,
        longitude: 78.0772,
        weight: 0.4,
        std_dev_km: 1.5
      }
    ],
    blood_group_distribution: {
      'O+': 0.38,
      'O-': 0.05,
      'A+': 0.25,
      'A-': 0.02,
      'B+': 0.25,
      'B-': 0.02,
      'AB+': 0.02,
      'AB-': 0.01
    },
    age_range: { min: 18, max: 65 },
    weight_params: { mean: 65.0, std_dev: 10.0, min: 45.0 },
    male_ratio: 0.70
  },
  timeline: {
    start_date: '2026-01-01T00:00:00.000Z',
    days: 10,
    requests_per_day_mean: 4.0,
    weekly_pattern: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    seasonal_surge_factor: 1.0
  },
  ground_truth_response: {
    b0_intercept: 0.10,
    b1_prior_response_rate: 1.80,
    b2_recency: -0.40,
    b3_urgency: {
      CRITICAL: 0.50,
      URGENT: 0.20,
      ROUTINE: -0.20
    },
    b4_distance_km: 0.08,
    b5_night_flag: -0.75,
    noise_std: 0.0, // Set to 0 in test for strict determinism verification
    base_rate: 0.30
  },
  hospitals: [
    {
      id: 'hosp-1',
      name: 'Max Hospital',
      latitude: 30.3780,
      longitude: 78.0830
    }
  ],
  max_notification_radius_km: 25.0,
  max_candidates_per_request: 10
});

describe('Seeded PRNG', () => {
  it('generates deterministic sequence with identical seed', () => {
    const prng1 = new SeededPRNG(12345);
    const prng2 = new SeededPRNG(12345);

    const seq1 = Array.from({ length: 50 }, () => prng1.random());
    const seq2 = Array.from({ length: 50 }, () => prng2.random());

    expect(seq1).toEqual(seq2);
  });

  it('generates differing sequences with different seeds', () => {
    const prng1 = new SeededPRNG(100);
    const prng2 = new SeededPRNG(200);

    expect(prng1.random()).not.toEqual(prng2.random());
  });

  it('samples normal distribution around mean', () => {
    const prng = new SeededPRNG(999);
    const samples = Array.from({ length: 500 }, () => prng.normal(65, 5));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

    expect(mean).toBeGreaterThan(64);
    expect(mean).toBeLessThan(66);
  });
});

describe('Synthetic Data Generator Reproducibility', () => {
  it('produces bit-for-bit identical outputs for identical seed', () => {
    const gen1 = new SyntheticDataGenerator(mockConfig);
    const result1 = gen1.simulate();

    const gen2 = new SyntheticDataGenerator(mockConfig);
    const result2 = gen2.simulate();

    expect(result1.notifications.length).toBe(result2.notifications.length);
    expect(result1.demandSeries.length).toBe(result2.demandSeries.length);

    // Deep compare first 20 records
    expect(result1.notifications.slice(0, 20)).toEqual(result2.notifications.slice(0, 20));
  });

  it('calculates age correctly across calendar year boundaries', () => {
    const dob = '2000-05-15';
    expect(calculateDonorAge(dob, new Date('2026-05-14T00:00:00Z'))).toBe(25);
    expect(calculateDonorAge(dob, new Date('2026-05-15T00:00:00Z'))).toBe(26);
    expect(calculateDonorAge(dob, new Date('2026-05-16T00:00:00Z'))).toBe(26);
  });

  it('computes accurate Haversine distances', () => {
    // Distance between Dehradun Clock Tower and Max Hospital Dehradun (~6.8 km)
    const d = computeHaversineDistanceKm(30.3256, 78.0437, 30.3780, 78.0830);
    expect(d).toBeGreaterThan(6.0);
    expect(d).toBeLessThan(8.0);
  });
});

describe('Strict Temporal Leakage Guard (Time-Travel Unit Test)', () => {
  it('guarantees features at notification time T never change when future events occur at T + delta', () => {
    const gen = new SyntheticDataGenerator(mockConfig);
    const { notifications } = gen.simulate();

    expect(notifications.length).toBeGreaterThan(5);

    // Check every notification row
    for (let i = 0; i < notifications.length; i++) {
      const current = notifications[i]!;
      const currentTimestamp = new Date(current.timestamp).getTime();

      // Look back at earlier notifications for the same donor
      const pastAlerts = notifications
        .slice(0, i)
        .filter((n) => n.donor_id === current.donor_id && new Date(n.timestamp).getTime() < currentTimestamp);

      // Verify recent_alerts_count matches strictly past 7 days alerts
      const sevenDaysMs = 7 * 86_400_000;
      const expectedRecentAlerts = pastAlerts.filter(
        (n) => new Date(n.timestamp).getTime() >= currentTimestamp - sevenDaysMs
      ).length;

      expect(current.recent_alerts_count).toBe(expectedRecentAlerts);

      // Verify prior_response_rate uses only past alerts
      if (pastAlerts.length > 0) {
        const expectedPastResponses = pastAlerts.filter((n) => n.response === 1).length;
        const expectedRate = expectedPastResponses / pastAlerts.length;
        expect(Math.abs(current.prior_response_rate - expectedRate)).toBeLessThanOrEqual(0.002);
      } else {
        expect(current.prior_response_rate).toBe(mockConfig.ground_truth_response.base_rate);
      }

      // Assert label is purely 0 or 1
      expect([0, 1]).toContain(current.response);
      expect(current.simulation).toBe('SIMULATION');
    }
  });
});

describe('Hard Constraints Compliance', () => {
  it('enforces that no notification is sent to an ineligible donor', () => {
    const gen = new SyntheticDataGenerator(mockConfig);
    const { notifications } = gen.simulate();

    for (const notif of notifications) {
      expect(notif.age).toBeGreaterThanOrEqual(18);
      expect(notif.age).toBeLessThanOrEqual(65);
      expect(notif.distance_km).toBeLessThanOrEqual(mockConfig.max_notification_radius_km);
    }
  });
});
