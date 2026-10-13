/**
 * CreateMatchRunUseCase
 * Orchestrates emergency blood request matching:
 * 1. Loads request and validates status.
 * 2. Resolves biologically compatible blood groups using pure domain rules.
 * 3. Adaptively queries geospatial candidate pool, expanding search radius in configured
 *    steps up to maxRadius if fewer than minCandidates are eligible.
 * 4. Strictly applies deterministic domain eligibility and availability rules (zero ML).
 * 5. Orders candidates using the injected ranker strategy.
 * 6. Atomically persists match_runs and match_candidates inside a single database transaction.
 */

import {
  type BloodGroup,
  type BloodComponent,
  getCompatibleDonorGroups
} from '../domain/compatibility.js';
import { evaluateDonorEligibility } from '../domain/eligibility.js';
import { evaluateDonorAvailability } from '../domain/availability.js';
import type { DonorRanker, CandidateForRanking } from '../domain/ranker.js';
import type {
  ISpatialCandidateRepository,
  MatchRunRecord,
  CandidateSpatialRecord
} from '../infrastructure/spatial-candidate.repository.js';
import type { IRoutingClient } from '../infrastructure/routing-client.js';
import { NoOpRoutingClient } from '../infrastructure/routing-client.js';
import { NotFoundError, ConflictError } from '../../../platform/http/errors.js';

export interface MatchRunConfig {
  initialRadiusMeters: number;
  radiusStepMeters: number;
  maxRadiusMeters: number;
  minCandidates: number;
}

export const DEFAULT_MATCH_RUN_CONFIG: MatchRunConfig = {
  initialRadiusMeters: 5000,   // 5 km initial radius
  radiusStepMeters: 5000,      // 5 km expansion step
  maxRadiusMeters: 30000,      // 30 km maximum radius
  minCandidates: 5             // Minimum target eligible candidate count
};

export interface CreateMatchRunInput {
  requestId: string;
  initialRadiusMeters?: number;
  radiusStepMeters?: number;
  maxRadiusMeters?: number;
  minCandidates?: number;
  asOfDate?: Date;
}

export interface CreateMatchRunResult {
  run: MatchRunRecord;
  candidateCount: number;
  finalRadiusMeters: number;
  expansionSteps: number;
  totalScanned: number;
}

export class CreateMatchRunUseCase {
  constructor(
    private readonly candidateRepo: ISpatialCandidateRepository,
    private readonly ranker: DonorRanker,
    private readonly routingClient: IRoutingClient = new NoOpRoutingClient(),
    private readonly config: MatchRunConfig = DEFAULT_MATCH_RUN_CONFIG
  ) {}

  public async execute(input: CreateMatchRunInput): Promise<CreateMatchRunResult> {
    const asOfDate = input.asOfDate ?? new Date();

    // 1. Load Blood Request
    const request = await this.candidateRepo.findRequestById(input.requestId);
    if (!request) {
      throw new NotFoundError(`Blood request '${input.requestId}' not found`);
    }

    if (request.status !== 'open' && request.status !== 'matching') {
      throw new ConflictError(
        `Cannot execute matching on blood request with status '${request.status}'`
      );
    }

    // 2. Build compatible donor blood groups
    const compatibleBloodGroups: BloodGroup[] = getCompatibleDonorGroups(
      request.bloodGroup,
      request.component as BloodComponent
    );

    // 3. Adaptive radius expansion loop
    let currentRadius = input.initialRadiusMeters ?? this.config.initialRadiusMeters;
    const stepMeters = input.radiusStepMeters ?? this.config.radiusStepMeters;
    const maxRadius = input.maxRadiusMeters ?? this.config.maxRadiusMeters;
    const minCandidates = input.minCandidates ?? this.config.minCandidates;

    let eligibleCandidates: CandidateSpatialRecord[] = [];
    let expansionSteps = 0;
    let totalScanned = 0;

    while (true) {
      expansionSteps++;

      // PostGIS query (coordinates never leave DB)
      const rawCandidates = await this.candidateRepo.findCandidatesWithinRadius({
        hospitalLocation: request.location,
        compatibleBloodGroups,
        radiusMeters: currentRadius
      });
      totalScanned = rawCandidates.length;

      // Apply Hard Deterministic Domain Boundary: Availability & Eligibility
      eligibleCandidates = rawCandidates.filter((candidate) => {
        // Availability Gate
        const availability = evaluateDonorAvailability(
          {
            isAvailable: candidate.isAvailable,
            availableFrom: candidate.availableFrom
          },
          asOfDate
        );
        if (!availability.isAvailable) {
          return false;
        }

        // Statutory Eligibility Gate
        const eligibility = evaluateDonorEligibility(
          {
            dateOfBirth: candidate.dateOfBirth,
            weightKg: candidate.weightKg,
            sex: candidate.sex,
            lastDonationDate: candidate.lastDonationDate,
            eligibleAfter: candidate.eligibleAfter
          },
          request.component as BloodComponent,
          asOfDate
        );
        return eligibility.isEligible;
      });

      // Break if we met candidate threshold or reached maximum expansion radius
      if (eligibleCandidates.length >= minCandidates || currentRadius >= maxRadius) {
        break;
      }

      // Expand search horizon
      currentRadius = Math.min(maxRadius, currentRadius + stepMeters);
    }

    // 4. Score and Rank candidates with injected ranker
    const candidatesForRanking: CandidateForRanking[] = eligibleCandidates.map((c) => ({
      donorId: c.donorId,
      distanceMeters: c.distanceMeters,
      lastRespondedAt: c.lastRespondedAt,
      bloodGroup: c.bloodGroup
    }));

    const rankedCandidates = this.ranker.rank(
      candidatesForRanking,
      {
        id: request.id,
        bloodGroup: request.bloodGroup,
        component: request.component,
        urgency: request.urgency
      },
      { asOfDate }
    );

    // 5. Build persistence payloads (with optional routing metadata)
    const candidatesToPersist = await Promise.all(
      rankedCandidates.map(async (rc) => {
        let travelSeconds: number | null = null;
        if (request.location) {
          const route = await this.routingClient.calculateRoute(
            request.location,
            request.location // Destination is relative
          );
          if (route) {
            travelSeconds = route.durationSeconds;
          }
        }

        return {
          donorId: rc.donorId,
          rank: rc.rank,
          score: rc.score,
          distanceMeters: rc.distanceMeters,
          travelSeconds,
          pResponse: rc.pResponse ?? null,
          batchNo: 1
        };
      })
    );

    // 6. Atomically persist match run + candidates
    const { run, candidateCount } = await this.candidateRepo.persistMatchRun(
      {
        requestId: request.id,
        algorithm: this.ranker.algorithm,
        algorithmVersion: this.ranker.algorithmVersion,
        config: {
          initialRadiusMeters: input.initialRadiusMeters ?? this.config.initialRadiusMeters,
          finalRadiusMeters: currentRadius,
          maxRadiusMeters: maxRadius,
          radiusStepMeters: stepMeters,
          minCandidates,
          expansionSteps,
          totalScanned,
          eligibleCount: eligibleCandidates.length
        },
        modelVersion: null,
        degraded: false
      },
      candidatesToPersist
    );

    return {
      run,
      candidateCount,
      finalRadiusMeters: currentRadius,
      expansionSteps,
      totalScanned
    };
  }
}
