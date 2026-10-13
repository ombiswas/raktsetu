import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BloodRequestsRepository } from './blood-requests.repository.js';
import { BloodRequestsService } from './blood-requests.service.js';
import { BloodRequestsController } from './blood-requests.controller.js';
import {
  createBloodRequestSchema,
  cancelBloodRequestSchema,
  listBloodRequestsQuerySchema,
  hospitalBloodRequestResponseSchema,
  hospitalBloodRequestListResponseSchema,
  readOnlyBloodRequestResponseSchema,
  readOnlyBloodRequestListResponseSchema
} from './blood-requests.schema.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { AuditService } from '../audit/audit.service.js';
import { requestEventBus } from './domain/events.js';

export interface BloodRequestsRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: BloodRequestsService;
}

export const bloodRequestsRoutes: FastifyPluginAsync<BloodRequestsRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const repository = new BloodRequestsRepository(db);
  const audit = new AuditService(db, config);
  const service =
    options.service ?? new BloodRequestsService(repository, audit, requestEventBus);
  const controller = new BloodRequestsController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. POST /v1/requests (Hospital only, must be verified)
  app.post<{
    Body: z.infer<typeof createBloodRequestSchema>;
    Headers: { 'idempotency-key'?: string };
  }>(
    '',
    {
      config: {
        auth: true,
        roles: ['hospital'],
        rateLimit: {
          max: 20,
          timeWindow: '1 minute'
        }
      },
      preHandler: [authenticate, authorize('hospital')],
      schema: {
        tags: ['Blood Requests'],
        summary: 'Create blood request (Hospital only)',
        body: createBloodRequestSchema,
        headers: z.object({
          'idempotency-key': z.string().optional()
        }),
        response: {
          201: hospitalBloodRequestResponseSchema
        }
      }
    },
    (req, reply) => controller.create(req, reply)
  );

  // 2. GET /v1/requests (Scoped to owning hospital for hospitals; read-only for blood banks & admins)
  app.get<{
    Querystring: z.infer<typeof listBloodRequestsQuerySchema>;
  }>(
    '',
    {
      config: {
        auth: true,
        roles: ['hospital', 'blood_bank', 'admin']
      },
      preHandler: [authenticate, authorize('hospital', 'blood_bank', 'admin')],
      schema: {
        tags: ['Blood Requests'],
        summary: 'List blood requests',
        querystring: listBloodRequestsQuerySchema,
        response: {
          200: z.union([
            hospitalBloodRequestListResponseSchema,
            readOnlyBloodRequestListResponseSchema
          ])
        }
      }
    },
    (req, reply) => controller.list(req, reply)
  );

  // 3. GET /v1/requests/:id (Scoped to owning hospital; read-only for blood banks & admins)
  app.get<{
    Params: { id: string };
  }>(
    '/:id',
    {
      config: {
        auth: true,
        roles: ['hospital', 'blood_bank', 'admin']
      },
      preHandler: [authenticate, authorize('hospital', 'blood_bank', 'admin')],
      schema: {
        tags: ['Blood Requests'],
        summary: 'Get blood request by ID',
        params: z.object({
          id: z.string().uuid()
        }),
        response: {
          200: z.union([
            hospitalBloodRequestResponseSchema,
            readOnlyBloodRequestResponseSchema
          ])
        }
      }
    },
    (req, reply) => controller.getById(req, reply)
  );

  // 4. PATCH /v1/requests/:id/cancel (Hospital only, must own the request)
  app.patch<{
    Params: { id: string };
    Body: z.infer<typeof cancelBloodRequestSchema>;
  }>(
    '/:id/cancel',
    {
      config: {
        auth: true,
        roles: ['hospital']
      },
      preHandler: [authenticate, authorize('hospital')],
      schema: {
        tags: ['Blood Requests'],
        summary: 'Cancel blood request (Owning hospital only)',
        params: z.object({
          id: z.string().uuid()
        }),
        body: cancelBloodRequestSchema,
        response: {
          200: hospitalBloodRequestResponseSchema
        }
      }
    },
    (req, reply) => controller.cancel(req, reply)
  );
};
