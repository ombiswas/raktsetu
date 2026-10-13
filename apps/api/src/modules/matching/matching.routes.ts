/**
 * Matching Routes Plugin
 * Exposes GET /v1/requests/:id/matching for hospital owner or admin inspection.
 */

import type { FastifyPluginAsync } from 'fastify';
import { SpatialCandidateRepository } from './infrastructure/spatial-candidate.repository.js';
import { MatchingService } from './matching.service.js';
import { MatchingController } from './matching.controller.js';
import {
  matchingParamsSchema,
  matchingStatusResponseSchema,
  type MatchingParams
} from './matching.schema.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';

export interface MatchingRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: MatchingService;
}

export const matchingRoutes: FastifyPluginAsync<MatchingRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const repository = new SpatialCandidateRepository(db);
  const service = options.service ?? new MatchingService(repository);
  const controller = new MatchingController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // GET /v1/requests/:id/matching (hospital owner or admin)
  app.get<{
    Params: MatchingParams;
  }>(
    '/:id/matching',
    {
      config: {
        auth: true,
        roles: ['hospital', 'admin']
      },
      preHandler: [authenticate, authorize('hospital', 'admin')],
      schema: {
        tags: ['Matching'],
        summary: 'Inspect anonymized matching status and candidates (Hospital owner / Admin)',
        description:
          'Returns run summary, candidate counts, and anonymized candidate ranks with approximate distance bands. No coordinates, full names, or phone numbers.',
        params: matchingParamsSchema,
        response: {
          200: matchingStatusResponseSchema
        }
      }
    },
    controller.getStatus
  );
};
