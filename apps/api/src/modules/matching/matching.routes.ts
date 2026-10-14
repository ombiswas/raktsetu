/**
 * Matching Routes Plugin
 * Exposes:
 * - GET /v1/requests/:id/matching: inspect anonymized candidate radar and consent-revealed contact info (Hospital/Admin)
 * - POST /v1/requests/:id/respond: record donor accept/decline response (Donor)
 */

import type { FastifyPluginAsync } from 'fastify';
import { SpatialCandidateRepository } from './infrastructure/spatial-candidate.repository.js';
import { MatchingService } from './matching.service.js';
import { MatchingController } from './matching.controller.js';
import {
  matchingParamsSchema,
  matchingStatusResponseSchema,
  respondRequestBodySchema,
  respondRequestResponseSchema,
  type MatchingParams,
  type RespondRequestBody
} from './matching.schema.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { AuditService } from '../audit/audit.service.js';

export interface MatchingRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: MatchingService;
  auditService?: AuditService;
}

export const matchingRoutes: FastifyPluginAsync<MatchingRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const repository = new SpatialCandidateRepository(db);
  const auditService = options.auditService ?? new AuditService(db, config);
  const service = options.service ?? new MatchingService(repository, auditService);
  const controller = new MatchingController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /v1/requests/:id/matching (hospital owner or admin)
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
        summary: 'Inspect matching status and candidates with consent reveal (Hospital owner / Admin)',
        description:
          'Returns run summary, candidate counts, and candidate ranks with approximate distance bands. Reveals name and phone strictly for accepted donors.',
        params: matchingParamsSchema,
        response: {
          200: matchingStatusResponseSchema
        }
      }
    },
    controller.getStatus
  );

  // 2. POST /v1/requests/:id/respond (donor only)
  app.post<{
    Params: MatchingParams;
    Body: RespondRequestBody;
  }>(
    '/:id/respond',
    {
      config: {
        auth: true,
        roles: ['donor']
      },
      preHandler: [authenticate, authorize('donor')],
      schema: {
        tags: ['Matching'],
        summary: 'Donor response to emergency blood request (accept/decline)',
        description:
          'Records voluntary donor acceptance or decline. Enforces idempotency and triggers fulfillment transition if target units are met.',
        params: matchingParamsSchema,
        body: respondRequestBodySchema,
        response: {
          200: respondRequestResponseSchema
        }
      }
    },
    controller.respond
  );
};
