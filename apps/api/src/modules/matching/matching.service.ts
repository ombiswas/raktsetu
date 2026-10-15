/**
 * Matching Service
 * Enforces authorization (hospital ownership / admin RBAC) and privacy boundaries.
 * Manages donor response logging, request fulfillment transitions, and consent-based
 * contact detail disclosure with immutable audit tracking.
 */

import type { ISpatialCandidateRepository } from './infrastructure/spatial-candidate.repository.js';
import type { MatchingStatusView, MatchingCandidateView } from './matching.types.js';
import { formatDistanceBand, type RespondRequestResponse } from './matching.schema.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../platform/http/errors.js';
import type { AuditService } from '../audit/audit.service.js';

export interface AuthenticatedUserContext {
  id: string;
  role: string;
}

export class MatchingService {
  constructor(
    private readonly repository: ISpatialCandidateRepository,
    private readonly auditService?: AuditService
  ) {}

  /**
   * Retrieves the latest match run and candidate rankings for a request.
   * Scoped strictly to the requesting hospital owner or platform administrators.
   *
   * REVEAL RULE:
   * Only after a donor accepts does the hospital view reveal the donor's first name
   * and contact phone number. All other candidates remain strictly cloaked.
   * Every contact reveal event is immutably logged in the audit trail.
   */
  public async getMatchingStatus(
    requestId: string,
    user: AuthenticatedUserContext
  ): Promise<MatchingStatusView> {
    // 1. Fetch Blood Request
    const request = await this.repository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError(`Blood request '${requestId}' not found`);
    }

    // 2. Ownership & RBAC check (deny by default)
    if (user.role !== 'admin' && request.hospitalId !== user.id) {
      throw new ForbiddenError(
        'You are not authorized to inspect matching candidate records for this blood request'
      );
    }

    // 3. Fetch latest match run
    const run = await this.repository.findLatestRunByRequestId(requestId);
    if (!run) {
      throw new NotFoundError(`No matching run found for blood request '${requestId}'`);
    }

    // 4. Fetch candidates for this run
    const candidates = await this.repository.findCandidatesByRunId(run.id);

    // 5. Aggregate status counts
    const candidateCounts = {
      total: candidates.length,
      pending: candidates.filter((c) => c.response === 'pending').length,
      accepted: candidates.filter((c) => c.response === 'accepted').length,
      declined: candidates.filter((c) => c.response === 'declined').length,
      noResponse: candidates.filter((c) => c.response === 'no_response').length
    };

    // 6. Build candidate views with conditional reveal rule
    const candidateViews: MatchingCandidateView[] = await Promise.all(
      candidates.map(async (c) => {
        let firstName: string | null = null;
        let phone: string | null = null;

        // Reveal contact info ONLY if the donor has accepted the request
        // and ONLY to the hospital that owns the request
        const isRequestOwnerHospital = user.role === 'hospital' && request.hospitalId === user.id;

        if (c.response === 'accepted') {
          const contact = await this.repository.findAcceptedCandidateContact(requestId, c.id);
          if (contact) {
            firstName = contact.firstName;

            if (isRequestOwnerHospital) {
              phone = contact.phone;

              // Audit log the reveal event
              await this.auditService?.record({
                action: 'donor_contact_revealed',
                entity: 'match_candidates',
                entityId: c.id,
                actorUserId: user.id,
                metadata: {
                  requestId,
                  donorId: c.donorId
                }
              });
            }
          }
        }

        const candidateView: MatchingCandidateView = {
          id: c.id,
          rank: c.rank,
          bloodGroup: c.bloodGroup ?? ('O+' as const),
          approximateDistance: formatDistanceBand(c.distanceM),
          responseStatus: c.response,
          score: c.score
        };

        if (firstName) {
          candidateView.firstName = firstName;
        }
        if (phone) {
          candidateView.phone = phone;
        }

        return candidateView;
      })
    );

    return {
      runId: run.id,
      requestId: run.requestId,
      algorithm: run.algorithm,
      algorithmVersion: run.algorithmVersion,
      modelVersion: run.modelVersion ?? null,
      degraded: run.degraded ?? false,
      createdAt: run.createdAt.toISOString(),
      config: run.config,
      candidateCounts,
      candidates: candidateViews
    };
  }

  /**
   * Records a voluntary donor's response (accept or decline) to an active match notification.
   * Enforces:
   * 1. Donor must have a pending candidate row for this request.
   * 2. Idempotent: repeated accept or decline calls succeed safely without duplication.
   * 3. Conflicting responses (changing decision after finalization) are rejected with 409 Conflict.
   * 4. When accepted count reaches request.unitsRequired, automatically transitions request to 'fulfilled'.
   */
  public async respondToRequest(
    requestId: string,
    donorId: string,
    action: 'accept' | 'decline',
    asOfDate?: Date
  ): Promise<RespondRequestResponse> {
    // 1. Find candidate record for this donor and request
    const candidate = await this.repository.findCandidateByRequestAndDonor(requestId, donorId);
    if (!candidate) {
      throw new ForbiddenError('You are not an invited candidate for this blood request');
    }

    const targetStatus = action === 'accept' ? 'accepted' : 'declined';

    // 2. Idempotency Check: if already answered with the same status
    if (candidate.response === targetStatus) {
      const isFulfilled =
        (await this.repository.countAcceptedCandidatesForRequest(requestId)) >=
        (await this.repository.findRequestById(requestId))!.unitsRequired;

      return {
        success: true,
        candidateId: candidate.id,
        response: targetStatus,
        isFulfilled,
        message: 'Response already recorded'
      };
    }

    // 3. Finalization Guard: cannot modify already decided response
    if (candidate.response !== 'pending') {
      throw new ConflictError(
        `Cannot respond '${action}': candidate decision has already been finalized as '${candidate.response}'`
      );
    }

    // 4. Atomically persist response
    const result = await this.repository.recordDonorResponse(candidate.id, targetStatus, asOfDate);

    // 5. Audit log donor response
    await this.auditService?.record({
      action: 'donor_response_recorded',
      entity: 'blood_requests',
      entityId: requestId,
      actorUserId: donorId,
      metadata: {
        candidateId: candidate.id,
        action,
        isFulfilled: result.isFulfilled,
        acceptedCount: result.acceptedCount
      }
    });

    return {
      success: true,
      candidateId: candidate.id,
      response: targetStatus,
      isFulfilled: result.isFulfilled,
      message: action === 'accept' ? 'Emergency request accepted successfully' : 'Emergency request declined'
    };
  }
}
