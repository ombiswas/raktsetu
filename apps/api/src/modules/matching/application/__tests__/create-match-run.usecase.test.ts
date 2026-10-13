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
      findCandidatesByRunId: vi.fn().mockResolvedValue([] as MatchCandidateRecord[])
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
});
