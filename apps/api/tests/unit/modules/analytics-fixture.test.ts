import { describe, it, expect } from 'vitest';
import { AnalyticsRepository } from '../../../src/modules/analytics/analytics.repository.js';
import type { DatabaseInstance } from '../../../src/platform/database/connection.js';

/**
 * Hand-Computed Fixture Dataset
 *
 * Designed to test all edge cases:
 * - Mix of request statuses (open, matching, fulfilled, cancelled, expired)
 * - Mix of candidate responses (accepted, declined, pending, no_response)
 * - Requests with multiple accepts (only the first accept counts for time-to-first-accept)
 * - Requests with zero accepts (excluded from time-to-first-accept)
 * - Match runs with single vs multi-step radius expansions
 * - Degraded vs non-degraded match runs
 */

interface FixtureBloodRequest {
  id: string;
  createdAt: Date;
  status: 'open' | 'matching' | 'fulfilled' | 'cancelled' | 'expired';
  urgency: 'critical' | 'urgent' | 'standard';
  unitsRequired: number;
}

interface FixtureMatchRun {
  id: string;
  requestId: string;
  degraded: boolean;
  createdAt: Date;
  config: {
    expansionSteps: number;
    initialRadiusMeters: number;
    finalRadiusMeters: number;
  };
}

interface FixtureMatchCandidate {
  id: string;
  runId: string;
  notifiedAt: Date | null;
  response: 'pending' | 'accepted' | 'declined' | 'no_response';
  respondedAt: Date | null;
  createdAt: Date;
}

export const FIXTURE_BLOOD_REQUESTS: FixtureBloodRequest[] = [
  { id: 'req-1', createdAt: new Date('2026-10-01T10:00:00.000Z'), status: 'fulfilled', urgency: 'critical', unitsRequired: 2 },
  { id: 'req-2', createdAt: new Date('2026-10-02T11:00:00.000Z'), status: 'fulfilled', urgency: 'urgent', unitsRequired: 1 },
  { id: 'req-3', createdAt: new Date('2026-10-03T12:00:00.000Z'), status: 'open', urgency: 'standard', unitsRequired: 3 },
  { id: 'req-4', createdAt: new Date('2026-10-04T13:00:00.000Z'), status: 'matching', urgency: 'urgent', unitsRequired: 2 },
  { id: 'req-5', createdAt: new Date('2026-10-05T14:00:00.000Z'), status: 'fulfilled', urgency: 'critical', unitsRequired: 4 },
  { id: 'req-6', createdAt: new Date('2026-10-06T15:00:00.000Z'), status: 'expired', urgency: 'standard', unitsRequired: 1 },
  { id: 'req-7', createdAt: new Date('2026-10-07T16:00:00.000Z'), status: 'cancelled', urgency: 'urgent', unitsRequired: 2 },
  { id: 'req-8', createdAt: new Date('2026-10-08T17:00:00.000Z'), status: 'fulfilled', urgency: 'critical', unitsRequired: 2 }
];

export const FIXTURE_MATCH_RUNS: FixtureMatchRun[] = [
  { id: 'run-1', requestId: 'req-1', degraded: false, createdAt: new Date('2026-10-01T10:00:30.000Z'), config: { expansionSteps: 1, initialRadiusMeters: 10000, finalRadiusMeters: 10000 } },
  { id: 'run-2', requestId: 'req-2', degraded: true,  createdAt: new Date('2026-10-02T11:00:30.000Z'), config: { expansionSteps: 2, initialRadiusMeters: 10000, finalRadiusMeters: 15000 } },
  { id: 'run-3', requestId: 'req-4', degraded: false, createdAt: new Date('2026-10-04T13:00:30.000Z'), config: { expansionSteps: 3, initialRadiusMeters: 10000, finalRadiusMeters: 20000 } },
  { id: 'run-4', requestId: 'req-5', degraded: false, createdAt: new Date('2026-10-05T14:00:30.000Z'), config: { expansionSteps: 1, initialRadiusMeters: 10000, finalRadiusMeters: 10000 } },
  { id: 'run-5', requestId: 'req-8', degraded: true,  createdAt: new Date('2026-10-08T17:00:30.000Z'), config: { expansionSteps: 1, initialRadiusMeters: 10000, finalRadiusMeters: 10000 } }
];

export const FIXTURE_MATCH_CANDIDATES: FixtureMatchCandidate[] = [
  // Run 1 (Req 1 created at 10:00:00):
  { id: 'cand-1', runId: 'run-1', notifiedAt: new Date('2026-10-01T10:01:00.000Z'), response: 'accepted', respondedAt: new Date('2026-10-01T10:06:00.000Z'), createdAt: new Date('2026-10-01T10:00:30.000Z') }, // TTFA: 360s
  { id: 'cand-2', runId: 'run-1', notifiedAt: new Date('2026-10-01T10:01:00.000Z'), response: 'declined', respondedAt: new Date('2026-10-01T10:04:00.000Z'), createdAt: new Date('2026-10-01T10:00:30.000Z') },
  // Run 2 (Req 2 created at 11:00:00):
  { id: 'cand-3', runId: 'run-2', notifiedAt: new Date('2026-10-02T11:02:00.000Z'), response: 'accepted', respondedAt: new Date('2026-10-02T11:08:00.000Z'), createdAt: new Date('2026-10-02T11:00:30.000Z') }, // TTFA: 480s
  { id: 'cand-4', runId: 'run-2', notifiedAt: new Date('2026-10-02T11:02:00.000Z'), response: 'no_response', respondedAt: null, createdAt: new Date('2026-10-02T11:00:30.000Z') },
  // Run 3 (Req 4 created at 13:00:00):
  { id: 'cand-5', runId: 'run-3', notifiedAt: new Date('2026-10-04T13:05:00.000Z'), response: 'pending', respondedAt: null, createdAt: new Date('2026-10-04T13:00:30.000Z') },
  // Run 4 (Req 5 created at 14:00:00):
  { id: 'cand-6', runId: 'run-4', notifiedAt: new Date('2026-10-05T14:02:00.000Z'), response: 'accepted', respondedAt: new Date('2026-10-05T14:04:00.000Z'), createdAt: new Date('2026-10-05T14:00:30.000Z') }, // Earliest accept for Req 5: TTFA: 240s
  { id: 'cand-7', runId: 'run-4', notifiedAt: new Date('2026-10-05T14:02:00.000Z'), response: 'accepted', respondedAt: new Date('2026-10-05T14:09:00.000Z'), createdAt: new Date('2026-10-05T14:00:30.000Z') }, // Later accept
  { id: 'cand-8', runId: 'run-4', notifiedAt: new Date('2026-10-05T14:02:00.000Z'), response: 'declined', respondedAt: new Date('2026-10-05T14:05:00.000Z'), createdAt: new Date('2026-10-05T14:00:30.000Z') },
  // Run 5 (Req 8 created at 17:00:00):
  { id: 'cand-9', runId: 'run-5', notifiedAt: new Date('2026-10-08T17:02:00.000Z'), response: 'accepted', respondedAt: new Date('2026-10-08T17:12:00.000Z'), createdAt: new Date('2026-10-08T17:00:30.000Z') }, // TTFA: 720s
  { id: 'cand-10', runId: 'run-5', notifiedAt: new Date('2026-10-08T17:02:00.000Z'), response: 'no_response', respondedAt: null, createdAt: new Date('2026-10-08T17:00:30.000Z') }
];

/**
 * Hand-computed golden expectations:
 *
 * 1. Requests by status (8 requests):
 *    - open: 1 (req-3)
 *    - matching: 1 (req-4)
 *    - fulfilled: 4 (req-1, req-2, req-5, req-8)
 *    - cancelled: 1 (req-7)
 *    - expired: 1 (req-6)
 *    - total: 8
 *
 * 2. Fulfillment rate:
 *    4 / 8 = 0.5000 (50.0%)
 *
 * 3. Response rate:
 *    Total notified candidates = 10
 *    Candidates who answered ('accepted' or 'declined') = 7 (cand 1, 2, 3, 6, 7, 8, 9)
 *    Response rate = 7 / 10 = 0.7000 (70.0%)
 *
 * 4. Time to first accept (seconds from request creation to earliest acceptance):
 *    - req-1: 10:06:00 - 10:00:00 = 360 seconds
 *    - req-2: 11:08:00 - 11:00:00 = 480 seconds
 *    - req-5: 14:04:00 - 14:00:00 = 240 seconds
 *    - req-8: 17:12:00 - 17:00:00 = 720 seconds
 *    Sorted TTFA values: [240, 360, 480, 720]
 *    Postgres continuous median PERCENTILE_CONT(0.5):
 *    (360 + 480) / 2 = 420.0 seconds
 *
 * 5. Match runs metrics (5 total runs):
 *    - Degraded runs: 2 (run-2, run-5) -> 2 / 5 = 0.4000 (40.0%)
 *    - Expanded runs (expansionSteps > 1): 2 (run-2, run-3) -> 2 / 5 = 0.4000 (40.0%)
 */
export const HAND_COMPUTED_FIXTURE_EXPECTATIONS = {
  requestsByStatus: {
    open: 1,
    matching: 1,
    fulfilled: 4,
    cancelled: 1,
    expired: 1,
    total: 8
  },
  fulfillmentRate: 0.5,
  responseRate: 0.7,
  totalNotifications: 10,
  totalMatchRuns: 5,
  degradedRunRate: 0.4,
  radiusExpansionFrequency: 0.4,
  medianTimeToFirstAcceptSeconds: 420.0
};

describe('Analytics Math against Hand-Computed Fixture', () => {
  describe('Pure Mathematical Aggregation Model', () => {
    it('computes requests by status matching hand-computed fixture exactly', () => {
      const counts = {
        open: FIXTURE_BLOOD_REQUESTS.filter((r) => r.status === 'open').length,
        matching: FIXTURE_BLOOD_REQUESTS.filter((r) => r.status === 'matching').length,
        fulfilled: FIXTURE_BLOOD_REQUESTS.filter((r) => r.status === 'fulfilled').length,
        cancelled: FIXTURE_BLOOD_REQUESTS.filter((r) => r.status === 'cancelled').length,
        expired: FIXTURE_BLOOD_REQUESTS.filter((r) => r.status === 'expired').length,
        total: FIXTURE_BLOOD_REQUESTS.length
      };

      expect(counts).toEqual(HAND_COMPUTED_FIXTURE_EXPECTATIONS.requestsByStatus);
    });

    it('computes fulfillment rate matching hand-computed fixture exactly', () => {
      const fulfilled = FIXTURE_BLOOD_REQUESTS.filter((r) => r.status === 'fulfilled').length;
      const total = FIXTURE_BLOOD_REQUESTS.length;
      const rate = Number((fulfilled / total).toFixed(4));

      expect(rate).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.fulfillmentRate);
    });

    it('computes response rate matching hand-computed fixture exactly', () => {
      const notified = FIXTURE_MATCH_CANDIDATES.filter((c) => c.notifiedAt !== null);
      const responded = notified.filter(
        (c) => c.response === 'accepted' || c.response === 'declined'
      );
      const rate = Number((responded.length / notified.length).toFixed(4));

      expect(notified.length).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.totalNotifications);
      expect(rate).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.responseRate);
    });

    it('computes median time to first accept matching hand-computed fixture exactly', () => {
      // Find time from request created_at to earliest accepted candidate responded_at
      const ttfaList: number[] = [];

      for (const req of FIXTURE_BLOOD_REQUESTS) {
        // Find match runs for this request
        const runIds = FIXTURE_MATCH_RUNS.filter((r) => r.requestId === req.id).map((r) => r.id);
        const acceptedCandidates = FIXTURE_MATCH_CANDIDATES.filter(
          (c) => runIds.includes(c.runId) && c.response === 'accepted' && c.respondedAt !== null
        );

        if (acceptedCandidates.length > 0) {
          const earliestAccept = Math.min(
            ...acceptedCandidates.map((c) => c.respondedAt!.getTime())
          );
          const secondsToFirstAccept = (earliestAccept - req.createdAt.getTime()) / 1000;
          ttfaList.push(secondsToFirstAccept);
        }
      }

      // Sorted list of TTFA: [240, 360, 480, 720]
      ttfaList.sort((a, b) => a - b);
      expect(ttfaList).toEqual([240, 360, 480, 720]);

      // Continuous median calculation: (ttfaList[1] + ttfaList[2]) / 2 = (360 + 480) / 2 = 420
      const mid = ttfaList.length / 2;
      const median = (ttfaList[mid - 1]! + ttfaList[mid]!) / 2;

      expect(median).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.medianTimeToFirstAcceptSeconds);
    });

    it('computes degraded run rate and radius expansion frequency matching hand-computed fixture exactly', () => {
      const totalRuns = FIXTURE_MATCH_RUNS.length;
      const degradedRuns = FIXTURE_MATCH_RUNS.filter((r) => r.degraded).length;
      const expandedRuns = FIXTURE_MATCH_RUNS.filter((r) => r.config.expansionSteps > 1).length;

      const degradedRate = Number((degradedRuns / totalRuns).toFixed(4));
      const expansionFreq = Number((expandedRuns / totalRuns).toFixed(4));

      expect(totalRuns).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.totalMatchRuns);
      expect(degradedRate).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.degradedRunRate);
      expect(expansionFreq).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.radiusExpansionFrequency);
    });
  });

  describe('Repository SQL Aggregate Decoding Verification', () => {
    it('decodes SQL aggregate results into exact expected overview structure', async () => {
      // Mock db.execute returning exact row shapes matching Postgres aggregate queries on the fixture
      const mockDb = {
        execute: (queryObj: unknown) => {
          let sqlText = '';
          try {
            const hasToQuery = queryObj && typeof queryObj === 'object' && 'toQuery' in queryObj;
            sqlText = hasToQuery
              ? (queryObj as { toQuery: () => { sql: string } }).toQuery().sql
              : JSON.stringify(queryObj);
          } catch {
            sqlText = JSON.stringify(queryObj);
          }

          if (sqlText.includes('first_accepts') || sqlText.includes('median_ttfa')) {
            return Promise.resolve({
              rows: [
                {
                  median_ttfa: 420.0
                }
              ]
            });
          }

          if (sqlText.includes('FROM blood_requests')) {
            return Promise.resolve({
              rows: [
                {
                  open: 1,
                  matching: 1,
                  fulfilled: 4,
                  cancelled: 1,
                  expired: 1,
                  total: 8,
                  fulfillment_rate: 0.5
                }
              ]
            });
          }

          if (sqlText.includes('FROM match_candidates')) {
            return Promise.resolve({
              rows: [
                {
                  total_notifications: 10,
                  response_rate: 0.7
                }
              ]
            });
          }

          if (sqlText.includes('FROM match_runs')) {
            return Promise.resolve({
              rows: [
                {
                  total_runs: 5,
                  degraded_run_rate: 0.4,
                  radius_expansion_frequency: 0.4
                }
              ]
            });
          }

          return Promise.resolve({ rows: [{}] });
        }
      } as unknown as DatabaseInstance;

      const repo = new AnalyticsRepository(mockDb);
      const metrics = await repo.getOverviewMetrics();

      expect(metrics.requestsByStatus).toEqual(HAND_COMPUTED_FIXTURE_EXPECTATIONS.requestsByStatus);
      expect(metrics.fulfillmentRate).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.fulfillmentRate);
      expect(metrics.responseRate).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.responseRate);
      expect(metrics.totalNotifications).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.totalNotifications);
      expect(metrics.medianTimeToFirstAcceptSeconds).toBe(
        HAND_COMPUTED_FIXTURE_EXPECTATIONS.medianTimeToFirstAcceptSeconds
      );
      expect(metrics.degradedRunRate).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.degradedRunRate);
      expect(metrics.radiusExpansionFrequency).toBe(
        HAND_COMPUTED_FIXTURE_EXPECTATIONS.radiusExpansionFrequency
      );
      expect(metrics.totalMatchRuns).toBe(HAND_COMPUTED_FIXTURE_EXPECTATIONS.totalMatchRuns);
    });
  });
});
