import { describe, it, expect, vi } from 'vitest';
import {
  CreateMatchRunUseCase,
  type MatchRunConfig
} from '../create-match-run.usecase.js';
import { ProximityRanker } from '../../domain/ranker.js';
import type {
  ISpatialCandidateRepository,
  SpatialCandidateQuery,
  CandidateSpatialRecord,
  BloodRequestLookup,
  PersistMatchRunInput,
  PersistCandidateInput,
  MatchRunRecord,
  MatchCandidateRecord
} from '../../infrastructure/spatial-candidate.repository.js';
import { BloodGroups, type BloodGroup } from '../../domain/compatibility.js';

describe('CreateMatchRunUseCase Application Layer', () => {
  const asOfDate = new Date('2026-10-13T12:00:00.000Z');

  const baseHospitalLocation = { latitude: 28.5355, longitude: 77.291 };

  const validRequest: BloodRequestLookup = {
    id: '11111111-1111-1111-1111-111111111111',
    hospitalId: '22222222-2222-2222-2222-222222222222',
    bloodGroup: 'O+',
    component: 'whole_blood',
    unitsRequired: 2,
    urgency: 'critical',
    status: 'open',
    neededBy: new Date('2026-10-14T00:00:00.000Z'),
    location: baseHospitalLocation
  };

  function createEligibleCandidate(
    donorId: string,
    bloodGroup: BloodGroup = 'O+',
    distanceMeters: number = 3000
  ): CandidateSpatialRecord {
    return {
      donorId,
      bloodGroup,
      dateOfBirth: '1995-05-15', // 31 years old
      weightKg: 68,
      sex: 'male',
      isAvailable: true,
      availableFrom: null,
      eligibleAfter: null,
      lastDonationDate: '2026-06-01', // > 90 days ago
      distanceMeters,
      lastRespondedAt: null
    };
  }

  function createMockRepo(candidatesByRadius: (radius: number) => CandidateSpatialRecord[]): {
    repo: ISpatialCandidateRepository;
    persistedRuns: PersistMatchRunInput[];
    persistedCandidates: PersistCandidateInput[];
  } {
    const persistedRuns: PersistMatchRunInput[] = [];
    const persistedCandidates: PersistCandidateInput[] = [];

    const repo: ISpatialCandidateRepository = {
      findRequestById: vi.fn().mockResolvedValue(validRequest),
      findCandidatesWithinRadius: vi.fn().mockImplementation((query: SpatialCandidateQuery) => {
        return Promise.resolve(candidatesByRadius(query.radiusMeters));
      }),
      persistMatchRun: vi.fn().mockImplementation(
        (runData: PersistMatchRunInput, candidates: PersistCandidateInput[]) => {
          persistedRuns.push(runData);
          persistedCandidates.push(...candidates);
          const record: MatchRunRecord = {
            id: '33333333-3333-3333-3333-333333333333',
            requestId: runData.requestId,
            algorithm: runData.algorithm,
            algorithmVersion: runData.algorithmVersion,
            config: runData.config,
            modelVersion: runData.modelVersion ?? null,
            degraded: runData.degraded ?? false,
            createdAt: new Date()
          };
          return Promise.resolve({ run: record, candidateCount: candidates.length });
        }
      ),
      findLatestRunByRequestId: vi.fn().mockResolvedValue(null),
      findCandidatesByRunId: vi.fn().mockResolvedValue([] as MatchCandidateRecord[]),
      findDonorHistoryForFeatures: vi.fn().mockResolvedValue({ donations: [], candidateHistory: [] }),
      findCandidateByRequestAndDonor: vi.fn().mockResolvedValue(null),
      recordDonorResponse: vi.fn().mockResolvedValue({
        candidateId: 'cand-1',
        donorId: 'd-1',
        requestId: validRequest.id,
        response: 'accepted',
        isFulfilled: false,
        acceptedCount: 1,
        unitsRequired: 2
      }),
      markBatchPendingAsNoResponse: vi.fn().mockResolvedValue(0),
      findUnnotifiedCandidatesInRun: vi.fn().mockResolvedValue([]),
      markCandidatesNotified: vi.fn().mockResolvedValue(undefined),
      countAcceptedCandidatesForRequest: vi.fn().mockResolvedValue(0),
      findAcceptedCandidateContact: vi.fn().mockResolvedValue(null),
      appendCandidatesToRun: vi.fn().mockResolvedValue(0)
    };

    return { repo, persistedRuns, persistedCandidates };
  }

  describe('Adaptive Radius Expansion', () => {
    it('expands radius in steps until minCandidates target is reached', async () => {
      // Radius <= 5000: 1 candidate
      // Radius <= 10000: 2 candidates
      // Radius <= 15000: 4 candidates (>= minCandidates 3)
      const candidatesByRadius = (radius: number): CandidateSpatialRecord[] => {
        if (radius <= 5000) {
          return [createEligibleCandidate('d-1', 'O+', 2500)];
        }
        if (radius <= 10000) {
          return [
            createEligibleCandidate('d-1', 'O+', 2500),
            createEligibleCandidate('d-2', 'O+', 7200)
          ];
        }
        return [
          createEligibleCandidate('d-1', 'O+', 2500),
          createEligibleCandidate('d-2', 'O+', 7200),
          createEligibleCandidate('d-3', 'O+', 11500),
          createEligibleCandidate('d-4', 'O+', 13400)
        ];
      };

      const { repo, persistedRuns, persistedCandidates } = createMockRepo(candidatesByRadius);
      const config: MatchRunConfig = {
        initialRadiusMeters: 5000,
        radiusStepMeters: 5000,
        maxRadiusMeters: 25000,
        minCandidates: 3
      };

      const useCase = new CreateMatchRunUseCase(repo, new ProximityRanker(), undefined, config);
      const result = await useCase.execute({
        requestId: validRequest.id,
        asOfDate
      });

      expect(result.finalRadiusMeters).toBe(15000);
      expect(result.expansionSteps).toBe(3);
      expect(result.candidateCount).toBe(4);
      expect(repo.findCandidatesWithinRadius).toHaveBeenCalledTimes(3);

      expect(persistedRuns).toHaveLength(1);
      expect(persistedCandidates).toHaveLength(4);
      expect(persistedCandidates.map((c) => c.rank)).toEqual([1, 2, 3, 4]);
      expect(persistedCandidates.map((c) => c.donorId)).toEqual(['d-1', 'd-2', 'd-3', 'd-4']);
    });

    it('stops expanding when maxRadius is reached even if minCandidates is unfilled', async () => {
      // Maximum 2 candidates exist within entire 20km
      const candidatesByRadius = (): CandidateSpatialRecord[] => [
        createEligibleCandidate('d-1', 'O+', 3000),
        createEligibleCandidate('d-2', 'O+', 12000)
      ];

      const { repo } = createMockRepo(candidatesByRadius);
      const config: MatchRunConfig = {
        initialRadiusMeters: 5000,
        radiusStepMeters: 5000,
        maxRadiusMeters: 20000,
        minCandidates: 10 // Impossible target
      };

      const useCase = new CreateMatchRunUseCase(repo, new ProximityRanker(), undefined, config);
      const result = await useCase.execute({
        requestId: validRequest.id,
        asOfDate
      });

      expect(result.finalRadiusMeters).toBe(20000);
      expect(result.candidateCount).toBe(2);
    });
  });

  describe('Property-Style Constraint Filter Guarantee', () => {
    it('guarantees that a candidate violating ANY hard constraint NEVER appears in ranked output', async () => {
      // Generate candidates failing every distinct hard constraint
      const invalidCandidates: CandidateSpatialRecord[] = [
        // 1. Underage (< 18)
        {
          ...createEligibleCandidate('violator-underage', 'O+'),
          dateOfBirth: '2010-01-01'
        },
        // 2. Overage (> 65)
        {
          ...createEligibleCandidate('violator-overage', 'O+'),
          dateOfBirth: '1955-01-01'
        },
        // 3. Underweight (< 45 kg)
        {
          ...createEligibleCandidate('violator-underweight', 'O+'),
          weightKg: 42.5
        },
        // 4. Male cooldown interval (< 90 days)
        {
          ...createEligibleCandidate('violator-male-interval', 'O+'),
          sex: 'male',
          lastDonationDate: '2026-09-01' // ~42 days ago
        },
        // 5. Female cooldown interval (< 120 days)
        {
          ...createEligibleCandidate('violator-female-interval', 'O+'),
          sex: 'female',
          lastDonationDate: '2026-07-01' // ~104 days ago
        },
        // 6. Eligible after future date
        {
          ...createEligibleCandidate('violator-future-eligible', 'O+'),
          eligibleAfter: '2026-11-01'
        },
        // 7. Paused availability (isAvailable = false)
        {
          ...createEligibleCandidate('violator-paused', 'O+'),
          isAvailable: false
        },
        // 8. Available from future timestamp
        {
          ...createEligibleCandidate('violator-available-from-future', 'O+'),
          availableFrom: new Date('2026-10-15T00:00:00.000Z')
        }
      ];

      // Also 1 valid donor
      const validDonor = createEligibleCandidate('valid-hero-donor', 'O+', 2000);

      const allCandidates = [...invalidCandidates, validDonor];
      const { repo, persistedCandidates } = createMockRepo(() => allCandidates);

      const useCase = new CreateMatchRunUseCase(repo, new ProximityRanker());
      const result = await useCase.execute({
        requestId: validRequest.id,
        asOfDate
      });

      // ONLY valid donor should survive
      expect(result.candidateCount).toBe(1);
      expect(persistedCandidates).toHaveLength(1);
      expect(persistedCandidates[0]?.donorId).toBe('valid-hero-donor');

      // Assert none of the violators exist in output
      for (const violator of invalidCandidates) {
        expect(persistedCandidates.some((c) => c.donorId === violator.donorId)).toBe(false);
      }
    });

    it('property test across all 8 blood groups: only biologically compatible donors are queried', async () => {
      // For recipient O+, compatible donor groups are O- and O+ only.
      // Candidate repo query is called with compatibleBloodGroups.
      const { repo } = createMockRepo(() => []);
      const useCase = new CreateMatchRunUseCase(repo, new ProximityRanker());

      await useCase.execute({ requestId: validRequest.id, asOfDate });

      const lastCall = vi.mocked(repo.findCandidatesWithinRadius).mock.calls[0];
      const queriedGroups = lastCall?.[0]?.compatibleBloodGroups ?? [];

      expect(queriedGroups.sort()).toEqual(['O-', 'O+'].sort());

      // Incompatible groups like A+, B+, AB+ must never be in queried groups
      for (const bg of BloodGroups) {
        if (bg !== 'O-' && bg !== 'O+') {
          expect(queriedGroups).not.toContain(bg);
        }
      }
    });
  });

  describe('ML Integration, Degradation Fallback & Batch Notifications', () => {
    it('falls back gracefully to ProximityRanker and sets degraded=true when ML service is down', async () => {
      const candidates = [
        createEligibleCandidate('d-1', 'O+', 3000),
        createEligibleCandidate('d-2', 'O+', 5000)
      ];
      const { repo, persistedRuns, persistedCandidates } = createMockRepo(() => candidates);

      const mockPredictor = {
        predictBatch: vi.fn().mockResolvedValue({
          isAvailable: false,
          reason: 'Circuit breaker is OPEN: ML service connection timeout'
        })
      };

      const { HybridRanker } = await import('../../domain/hybrid-ranker.js');
      const useCase = new CreateMatchRunUseCase(
        repo,
        new HybridRanker(),
        undefined,
        undefined,
        {
          responsePredictor: mockPredictor
        }
      );

      const result = await useCase.execute({ requestId: validRequest.id, asOfDate });

      expect(result.candidateCount).toBe(2);
      expect(persistedRuns).toHaveLength(1);
      expect(persistedRuns[0]!.degraded).toBe(true);
      expect(persistedRuns[0]!.algorithm).toBe('hybrid'); // strategy recorded in match_runs, degraded=true indicates fallback
      expect(persistedCandidates).toHaveLength(2);
    });

    it('successfully scores candidates with HybridRanker when ML predictions succeed', async () => {
      const candidates = [
        createEligibleCandidate('d-1', 'O+', 3000),
        createEligibleCandidate('d-2', 'O+', 5000)
      ];
      const { repo, persistedRuns, persistedCandidates } = createMockRepo(() => candidates);

      const predictionsMap = new Map<string, number>([
        ['d-1', 0.85],
        ['d-2', 0.40]
      ]);

      const mockPredictor = {
        predictBatch: vi.fn().mockResolvedValue({
          isAvailable: true,
          predictions: predictionsMap,
          modelVersion: 'v1.0.0-xgb'
        })
      };

      const { HybridRanker } = await import('../../domain/hybrid-ranker.js');
      const useCase = new CreateMatchRunUseCase(
        repo,
        new HybridRanker(),
        undefined,
        undefined,
        {
          responsePredictor: mockPredictor
        }
      );

      const result = await useCase.execute({ requestId: validRequest.id, asOfDate });

      expect(result.candidateCount).toBe(2);
      expect(persistedRuns[0]!.degraded).toBe(false);
      expect(persistedRuns[0]!.algorithm).toBe('hybrid');
      expect(persistedRuns[0]!.modelVersion).toBe('v1.0.0-xgb');

      // Rank 1 candidate should have the ML prediction and hybrid score recorded
      expect(persistedCandidates[0]!.pResponse).toBe(0.85);
      expect(persistedCandidates[0]!.score).toBeGreaterThan(0);
    });

    it('assigns batchNo: 1 to top K candidates and dispatches alerts via NotificationsService', async () => {
      const candidates = [
        createEligibleCandidate('d-1', 'O+', 2000),
        createEligibleCandidate('d-2', 'O+', 3000),
        createEligibleCandidate('d-3', 'O+', 4000),
        createEligibleCandidate('d-4', 'O+', 5000)
      ];
      const { repo, persistedCandidates } = createMockRepo(() => candidates);

      const mockNotifyDonor = vi.fn().mockResolvedValue({
        id: 'notif-1',
        userId: 'd-1',
        kind: 'donor_match_alert',
        payload: {},
        readAt: null,
        createdAt: new Date().toISOString()
      });

      const mockNotificationsService = {
        notifyDonor: mockNotifyDonor
      } as unknown as import('../../../notifications/notifications.service.js').NotificationsService;

      const useCase = new CreateMatchRunUseCase(
        repo,
        new ProximityRanker(),
        undefined,
        undefined,
        {
          notificationsService: mockNotificationsService,
          batchSize: 2
        }
      );

      const result = await useCase.execute({ requestId: validRequest.id, asOfDate });

      expect(result.notifiedCount).toBe(2);
      expect(mockNotifyDonor).toHaveBeenCalledTimes(2);

      // Verify batch 1 assignment on top 2 candidates
      const batch1Candidates = persistedCandidates.filter((c) => c.batchNo === 1);
      expect(batch1Candidates).toHaveLength(2);
      expect(batch1Candidates.every((c) => c.notifiedAt !== null && c.notifiedAt !== undefined)).toBe(true);

      // Remaining candidates are in unnotified backlog (batchNo: 0, notifiedAt: null)
      const backlog = persistedCandidates.filter((c) => c.batchNo === 0);
      expect(backlog).toHaveLength(2);
      expect(backlog.every((c) => !c.notifiedAt)).toBe(true);
    });
  });
});

