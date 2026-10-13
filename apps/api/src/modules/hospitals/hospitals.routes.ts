import type { FastifyPluginAsync } from 'fastify';
import { HospitalsRepository } from './hospitals.repository.js';
import { HospitalsService } from './hospitals.service.js';
import { HospitalsController } from './hospitals.controller.js';
import {
  updateHospitalProfileSchema,
  hospitalProfileResponseSchema
} from './hospitals.schema.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { AuditService } from '../audit/audit.service.js';

export interface HospitalRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: HospitalsService;
}

export const hospitalRoutes: FastifyPluginAsync<HospitalRoutesOptions> = async (app, options) => {
  const { db, config } = options;
  const repository = new HospitalsRepository(db);
  const audit = new AuditService(db, config);
  const service = options.service ?? new HospitalsService(repository, audit);
  const controller = new HospitalsController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /v1/hospitals/me
  app.get(
    '/me',
    {
      config: {
        auth: true,
        roles: ['hospital']
      },
      preHandler: [authenticate, authorize('hospital')],
      schema: {
        tags: ['Hospitals'],
        summary: 'Get authenticated hospital profile',
        response: {
          200: hospitalProfileResponseSchema
        }
      }
    },
    (req, reply) => controller.getMe(req, reply)
  );

  // 2. PATCH /v1/hospitals/me
  app.patch(
    '/me',
    {
      config: {
        auth: true,
        roles: ['hospital']
      },
      preHandler: [authenticate, authorize('hospital')],
      schema: {
        tags: ['Hospitals'],
        summary: 'Update authenticated hospital profile fields',
        body: updateHospitalProfileSchema,
        response: {
          200: hospitalProfileResponseSchema
        }
      }
    },
    (req, reply) => controller.patchMe(req, reply)
  );
};
