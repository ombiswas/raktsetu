import type { FastifyPluginAsync } from 'fastify';
import { DonorsRepository } from './donors.repository.js';
import { DonorsService } from './donors.service.js';
import { DonorsController } from './donors.controller.js';
import {
  updateDonorProfileSchema,
  updateDonorLocationSchema,
  donorProfileResponseSchema,
  donorLocationResponseSchema,
  donorDonationHistoryResponseSchema
} from './donors.schema.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { AuditService } from '../audit/audit.service.js';

export interface DonorRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: DonorsService;
}

export const donorRoutes: FastifyPluginAsync<DonorRoutesOptions> = async (app, options) => {
  const { db, config } = options;
  const repository = new DonorsRepository(db);
  const audit = new AuditService(db, config);
  const service = options.service ?? new DonorsService(repository, audit);
  const controller = new DonorsController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /v1/donors/me
  app.get(
    '/me',
    {
      config: {
        auth: true,
        roles: ['donor']
      },
      preHandler: [authenticate, authorize('donor')],
      schema: {
        tags: ['Donors'],
        summary: 'Get authenticated donor profile',
        response: {
          200: donorProfileResponseSchema
        }
      }
    },
    (req, reply) => controller.getMe(req, reply)
  );

  // 2. PATCH /v1/donors/me
  app.patch(
    '/me',
    {
      config: {
        auth: true,
        roles: ['donor']
      },
      preHandler: [authenticate, authorize('donor')],
      schema: {
        tags: ['Donors'],
        summary: 'Update authenticated donor profile fields',
        body: updateDonorProfileSchema,
        response: {
          200: donorProfileResponseSchema
        }
      }
    },
    (req, reply) => controller.patchMe(req, reply)
  );

  // 3. PUT /v1/donors/me/location
  app.put(
    '/me/location',
    {
      config: {
        auth: true,
        roles: ['donor']
      },
      preHandler: [authenticate, authorize('donor')],
      schema: {
        tags: ['Donors'],
        summary: 'Explicitly update donor geospatial coordinates with consent',
        body: updateDonorLocationSchema,
        response: {
          200: donorLocationResponseSchema
        }
      }
    },
    (req, reply) => controller.putLocation(req, reply)
  );

  // 4. GET /v1/donors/me/donations
  app.get(
    '/me/donations',
    {
      config: {
        auth: true,
        roles: ['donor']
      },
      preHandler: [authenticate, authorize('donor')],
      schema: {
        tags: ['Donors'],
        summary: 'Get authenticated donor donation history',
        response: {
          200: donorDonationHistoryResponseSchema
        }
      }
    },
    (req, reply) => controller.getDonations(req, reply)
  );
};
