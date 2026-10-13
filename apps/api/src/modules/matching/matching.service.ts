/**
 * Matching Service
 * Enforces authorization (hospital ownership / admin RBAC) and privacy boundaries.
 * Returns anonymized candidate distances and status counts with zero PII.
 */

import type { ISpatialCandidateRepository } from './infrastructure/spatial-candidate.repository.js';
import type { MatchingStatusView } from './matching.types.js';
import { formatDistanceBand } from './matching.schema.js';
import { NotFoundError, ForbiddenError } from '../../platform/http/errors.js';

export interface AuthenticatedUserContext {
  id: string;
  role: string;
}

export class MatchingService {
  constructor(private readonly repository: ISpatialCandidateRepository) {}

  /**
   * Retrieves the latest match run and anonymized candidate rankings for a request.
   * Scoped strictly to the requesting hospital owner or platform administrators.
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

    // 6. Build anonymized candidate views (Privacy boundary: NO coordinates, names, or phones)
    const anonymizedCandidates = candidates.map((c) => ({
      id: c.id,
      rank: c.rank,
      bloodGroup: c.bloodGroup ?? ('O+' as const),
      approximateDistance: formatDistanceBand(c.distanceM),
      responseStatus: c.response,
      score: c.score
    }));

    return {
      runId: run.id,
      requestId: run.requestId,
      algorithm: run.algorithm,
      algorithmVersion: run.algorithmVersion,
      createdAt: run.createdAt.toISOString(),
      config: run.config,
      candidateCounts,
      candidates: anonymizedCandidates
    };
  }
}
