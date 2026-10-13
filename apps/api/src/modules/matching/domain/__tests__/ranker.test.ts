import { describe, it, expect } from 'vitest';
import { ProximityRanker, type CandidateForRanking, type RankingRequest } from '../ranker.js';

describe('ProximityRanker Domain Baseline', () => {
  const ranker = new ProximityRanker();
  const dummyRequest: RankingRequest = {
    id: 'req-1',
    bloodGroup: 'O+',
    component: 'whole_blood',
    urgency: 'critical'
  };

  it('ranks candidates strictly by ascending distance', () => {
    const candidates: CandidateForRanking[] = [
      { donorId: 'donor-c', distanceMeters: 5200, bloodGroup: 'O+' },
      { donorId: 'donor-a', distanceMeters: 1200, bloodGroup: 'O+' },
      { donorId: 'donor-b', distanceMeters: 3400, bloodGroup: 'O+' }
    ];

    const ranked = ranker.rank(candidates, dummyRequest);
    expect(ranked.map((r) => r.donorId)).toEqual(['donor-a', 'donor-b', 'donor-c']);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
    expect(ranked[1]?.score).toBeGreaterThan(ranked[2]?.score ?? 0);
  });

  it('tie-breaks by last response recency when distances are equal', () => {
    const tRecent = new Date('2026-10-12T10:00:00Z');
    const tOld = new Date('2026-10-01T10:00:00Z');

    const candidates: CandidateForRanking[] = [
      { donorId: 'donor-no-response', distanceMeters: 2000, lastRespondedAt: null, bloodGroup: 'O+' },
      { donorId: 'donor-old-response', distanceMeters: 2000, lastRespondedAt: tOld, bloodGroup: 'O+' },
      { donorId: 'donor-recent-response', distanceMeters: 2000, lastRespondedAt: tRecent, bloodGroup: 'O+' }
    ];

    const ranked = ranker.rank(candidates, dummyRequest);
    // Recent response ranks highest, then old, then no response
    expect(ranked.map((r) => r.donorId)).toEqual([
      'donor-recent-response',
      'donor-old-response',
      'donor-no-response'
    ]);
  });

  it('tie-breaks by donorId lexically when distances and response recency are identical', () => {
    const candidates: CandidateForRanking[] = [
      { donorId: 'donor-zebra', distanceMeters: 2500, lastRespondedAt: null, bloodGroup: 'O+' },
      { donorId: 'donor-alpha', distanceMeters: 2500, lastRespondedAt: null, bloodGroup: 'O+' },
      { donorId: 'donor-beta', distanceMeters: 2500, lastRespondedAt: null, bloodGroup: 'O+' }
    ];

    const ranked = ranker.rank(candidates, dummyRequest);
    expect(ranked.map((r) => r.donorId)).toEqual(['donor-alpha', 'donor-beta', 'donor-zebra']);
  });

  it('guarantees 100% determinism (same input produces identical ranking across 50 runs)', () => {
    const candidates: CandidateForRanking[] = [
      { donorId: 'donor-1', distanceMeters: 1500, bloodGroup: 'O+' },
      { donorId: 'donor-2', distanceMeters: 3000, bloodGroup: 'O+' },
      { donorId: 'donor-3', distanceMeters: 1500, lastRespondedAt: new Date('2026-10-10'), bloodGroup: 'O+' },
      { donorId: 'donor-4', distanceMeters: 4500, bloodGroup: 'O+' },
      { donorId: 'donor-5', distanceMeters: 1500, lastRespondedAt: new Date('2026-10-12'), bloodGroup: 'O+' }
    ];

    const firstRun = ranker.rank(candidates, dummyRequest);
    for (let i = 0; i < 50; i++) {
      const subsequentRun = ranker.rank(candidates, dummyRequest);
      expect(subsequentRun).toEqual(firstRun);
    }
  });
});
