/**
 * BatchExpansionUseCase
 * Implements the notify-respond-expand loop.
 * On batch window timeout:
 * 1. Checks if blood request is still open/matching (stops if fulfilled/cancelled/expired).
 * 2. Marks any remaining pending candidates in the current batch as 'no_response'.
 * 3. Evaluates if accepted units satisfy request.unitsRequired.
 * 4. If under-fulfilled, triggers the next candidate batch (batchNo + 1).
 * 5. If candidates in the current match run are exhausted, widens the PostGIS search radius
 *    and appends new candidates.
 * 6. Schedules the next timeout job with pg-boss (if boss present).
 */

import type PgBoss from 'pg-boss';
import type { ISpatialCandidateRepository } from '../infrastructure/spatial-candidate.repository.js';
import type { NotificationsService } from '../../notifications/notifications.service.js';
import type { DonorRanker } from '../domain/ranker.js';
import type { ResponsePredictor } from './response-predictor.interface.js';
import { DonorFeatureBuilder } from './donor-feature.builder.js';
import { getCompatibleDonorGroups, type BloodComponent } from '../domain/compatibility.js';
import { evaluateDonorAvailability } from '../domain/availability.js';
import { evaluateDonorEligibility } from '../domain/eligibility.js';

export interface BatchExpansionInput {
  requestId: string;
  runId: string;
  batchNo: number;
  asOfDate?: Date;
}

export interface BatchExpansionResult {
  status: 'fulfilled' | 'next_batch_notified' | 'radius_expanded' | 'exhausted' | 'stopped';
  batchNo?: number;
  notifiedCount?: number;
  newRadiusMeters?: number;
  reason?: string;
}

export class BatchExpansionUseCase {
  constructor(
    private readonly repository: ISpatialCandidateRepository,
    private readonly notificationsService?: NotificationsService,
    private readonly boss?: PgBoss,
    private readonly batchSize: number = 5,
    private readonly batchWindowSeconds: number = 300,
    private readonly ranker?: DonorRanker,
    private readonly responsePredictor?: ResponsePredictor
  ) {}

  public async execute(input: BatchExpansionInput): Promise<BatchExpansionResult> {
    const asOfDate = input.asOfDate ?? new Date();

    // 1. Fetch Blood Request
    const request = await this.repository.findRequestById(input.requestId);
    if (!request) {
      return { status: 'stopped', reason: `Blood request '${input.requestId}' not found` };
    }

    if (request.status === 'fulfilled' || request.status === 'cancelled' || request.status === 'expired') {
      return { status: 'stopped', reason: `Blood request status is already '${request.status}'` };
    }

    // 2. Fetch Match Run
    const run = await this.repository.findLatestRunByRequestId(input.requestId);
    if (!run || run.id !== input.runId) {
      return { status: 'stopped', reason: `Match run '${input.runId}' is not the active run` };
    }

    // 3. Mark remaining 'pending' candidates in current batch as 'no_response'
    await this.repository.markBatchPendingAsNoResponse(input.runId, input.batchNo, asOfDate);

    // 4. Check total accepted candidates
    const acceptedCount = await this.repository.countAcceptedCandidatesForRequest(input.requestId);
    if (acceptedCount >= request.unitsRequired) {
      return { status: 'fulfilled', reason: 'Units required already fulfilled' };
    }

    const nextBatchNo = input.batchNo + 1;

    // 5. Look for unnotified candidates in current run
    const unnotified = await this.repository.findUnnotifiedCandidatesInRun(input.runId, this.batchSize);

    if (unnotified.length > 0) {
      const candidateIds = unnotified.map((c) => c.id);
      await this.repository.markCandidatesNotified(candidateIds, nextBatchNo, asOfDate);

      // Dispatch notifications
      if (this.notificationsService) {
        for (const candidate of unnotified) {
          await this.notificationsService.notifyDonor(candidate.donorId, {
            requestId: request.id,
            bloodGroup: request.bloodGroup,
            urgency: request.urgency as 'critical' | 'urgent' | 'standard',
            units: request.unitsRequired,
            respondUrl: `/requests/${request.id}`,
            approximateDistanceKm: Number((candidate.distanceM / 1000).toFixed(1)),
            issuedAt: asOfDate.toISOString()
          });
        }
      }

      // Schedule next timeout in pg-boss
      if (this.boss) {
        try {
          await this.boss.send(
            'matching.batch-timeout',
            { requestId: request.id, runId: run.id, batchNo: nextBatchNo },
            {
              startAfter: this.batchWindowSeconds,
              retryLimit: 3,
              retryDelay: 10,
              retryBackoff: true
            }
          );
        } catch {
          // In test / standalone environment without running boss
        }
      }

      return {
        status: 'next_batch_notified',
        batchNo: nextBatchNo,
        notifiedCount: unnotified.length
      };
    }

    // 6. Current run candidates exhausted -> Adaptive Radius Expansion
    const runConfig = run.config as {
      finalRadiusMeters?: number;
      maxRadiusMeters?: number;
      radiusStepMeters?: number;
    };

    const currentRadius = runConfig.finalRadiusMeters ?? 10000;
    const maxRadius = runConfig.maxRadiusMeters ?? 30000;
    const step = runConfig.radiusStepMeters ?? 5000;

    if (currentRadius >= maxRadius) {
      return {
        status: 'exhausted',
        reason: 'Maximum search radius reached with no remaining eligible candidates'
      };
    }

    const newRadius = Math.min(maxRadius, currentRadius + step);
    const compatibleGroups = getCompatibleDonorGroups(
      request.bloodGroup,
      request.component as BloodComponent
    );

    // Query PostGIS for wider candidate pool
    const widerCandidates = await this.repository.findCandidatesWithinRadius({
      hospitalLocation: request.location,
      compatibleBloodGroups: compatibleGroups,
      radiusMeters: newRadius
    });

    // Existing candidate donor IDs
    const existingCandidates = await this.repository.findCandidatesByRunId(input.runId);
    const existingDonorIds = new Set(existingCandidates.map((c) => c.donorId));

    // Filter newly found donors
    const newEligible = widerCandidates.filter((c) => {
      if (existingDonorIds.has(c.donorId)) return false;

      const availability = evaluateDonorAvailability(
        { isAvailable: c.isAvailable, availableFrom: c.availableFrom },
        asOfDate
      );
      if (!availability.isAvailable) return false;

      const eligibility = evaluateDonorEligibility(
        {
          dateOfBirth: c.dateOfBirth,
          weightKg: c.weightKg,
          sex: c.sex,
          lastDonationDate: c.lastDonationDate,
          eligibleAfter: c.eligibleAfter
        },
        request.component as BloodComponent,
        asOfDate
      );
      return eligibility.isEligible;
    });

    if (newEligible.length === 0) {
      return {
        status: 'exhausted',
        newRadiusMeters: newRadius,
        reason: 'No additional eligible candidates found in expanded radius'
      };
    }

    // Predict & score new candidates
    let scoredNew = newEligible.map((c) => ({
      donorId: c.donorId,
      distanceMeters: c.distanceMeters,
      lastRespondedAt: c.lastRespondedAt,
      bloodGroup: c.bloodGroup,
      pResponse: 0.3
    }));

    if (this.responsePredictor && this.ranker && this.ranker.algorithm === 'hybrid') {
      const featurePayloads = await Promise.all(
        newEligible.map(async (c) => {
          const history = await this.repository.findDonorHistoryForFeatures(c.donorId, asOfDate);
          return DonorFeatureBuilder.buildFeatures(
            {
              donorId: c.donorId,
              dateOfBirth: new Date(c.dateOfBirth),
              distanceMeters: c.distanceMeters,
              donations: history.donations,
              candidateHistory: history.candidateHistory
            },
            {
              urgency: request.urgency as 'critical' | 'urgent' | 'standard',
              unitsRequired: request.unitsRequired,
              asOfDate
            }
          );
        })
      );

      const mlResult = await this.responsePredictor.predictBatch({
        requestId: request.id,
        candidates: featurePayloads
      });

      if (mlResult.isAvailable) {
        scoredNew = scoredNew.map((c) => ({
          ...c,
          pResponse: mlResult.predictions.get(c.donorId) ?? 0.3
        }));
      }
    }

    const rankerToUse = this.ranker ?? {
      algorithm: 'baseline' as const,
      algorithmVersion: 'v1.0.0-fallback',
      rank: (cands: typeof scoredNew) =>
        cands.map((c, i) => ({
          donorId: c.donorId,
          rank: existingCandidates.length + i + 1,
          score: 1 - c.distanceMeters / 50000,
          distanceMeters: c.distanceMeters,
          pResponse: c.pResponse
        }))
    };

    const rankedNew = rankerToUse.rank(
      scoredNew,
      {
        id: request.id,
        bloodGroup: request.bloodGroup,
        component: request.component,
        urgency: request.urgency
      },
      { asOfDate }
    );

    // Append to run
    const startRank = existingCandidates.length + 1;
    const candidatesToAppend = rankedNew.map((rc, idx) => ({
      donorId: rc.donorId,
      rank: startRank + idx,
      score: rc.score,
      distanceMeters: rc.distanceMeters,
      pResponse: rc.pResponse ?? null,
      batchNo: nextBatchNo
    }));

    await this.repository.appendCandidatesToRun(input.runId, candidatesToAppend);

    // Pick top K of newly appended candidates to notify
    const topKNew = candidatesToAppend.slice(0, this.batchSize);
    const newlyAddedIds = (await this.repository.findCandidatesByRunId(input.runId))
      .filter((c) => topKNew.some((tk) => tk.donorId === c.donorId))
      .map((c) => c.id);

    await this.repository.markCandidatesNotified(newlyAddedIds, nextBatchNo, asOfDate);

    // Notify new candidates
    if (this.notificationsService) {
      for (const candidate of topKNew) {
        await this.notificationsService.notifyDonor(candidate.donorId, {
          requestId: request.id,
          bloodGroup: request.bloodGroup,
          urgency: request.urgency as 'critical' | 'urgent' | 'standard',
          units: request.unitsRequired,
          respondUrl: `/requests/${request.id}`,
          approximateDistanceKm: Number((candidate.distanceMeters / 1000).toFixed(1)),
          issuedAt: asOfDate.toISOString()
        });
      }
    }

    // Schedule next timeout in pg-boss
    if (this.boss) {
      try {
        await this.boss.send(
          'matching.batch-timeout',
          { requestId: request.id, runId: run.id, batchNo: nextBatchNo },
          {
            startAfter: this.batchWindowSeconds,
            retryLimit: 3,
            retryDelay: 10,
            retryBackoff: true
          }
        );
      } catch {
        // Safe in tests
      }
    }

    return {
      status: 'radius_expanded',
      newRadiusMeters: newRadius,
      batchNo: nextBatchNo,
      notifiedCount: topKNew.length
    };
  }
}
