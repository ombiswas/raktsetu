import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BloodBanksRepository } from './blood-banks.repository.js';
import { BloodBanksService } from './blood-banks.service.js';
import { BloodBanksController } from './blood-banks.controller.js';
import {
  updateBloodBankProfileSchema,
  recordDonationSchema,
  deferDonorSchema,
  bloodBankProfileResponseSchema,
  recordDonationResponseSchema,
  deferDonorResponseSchema
} from './blood-banks.schema.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { AuditService } from '../audit/audit.service.js';
import { inventoryRoutes } from '../inventory/index.js';

export interface BloodBankRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: BloodBanksService;
}

const donorParamSchema = z.object({
  id: z.string().uuid('Invalid donor ID parameter')
});

export const bloodBankRoutes: FastifyPluginAsync<BloodBankRoutesOptions> = async (app, options) => {
  const { db, config } = options;
  const repository = new BloodBanksRepository(db);
  const audit = new AuditService(db, config);
  const service = options.service ?? new BloodBanksService(repository, audit);
  const controller = new BloodBanksController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /v1/blood-banks/me
  app.get(
    '/me',
    {
      config: {
        auth: true,
        roles: ['blood_bank']
      },
      preHandler: [authenticate, authorize('blood_bank')],
      schema: {
        tags: ['Blood Banks'],
        summary: 'Get authenticated blood bank profile',
        response: {
          200: bloodBankProfileResponseSchema
        }
      }
    },
    (req, reply) => controller.getMe(req, reply)
  );

  // 2. PATCH /v1/blood-banks/me
  app.patch(
    '/me',
    {
      config: {
        auth: true,
        roles: ['blood_bank']
      },
      preHandler: [authenticate, authorize('blood_bank')],
      schema: {
        tags: ['Blood Banks'],
        summary: 'Update authenticated blood bank profile fields',
        body: updateBloodBankProfileSchema,
        response: {
          200: bloodBankProfileResponseSchema
        }
      }
    },
    (req, reply) => controller.patchMe(req, reply)
  );

  // 3. POST /v1/blood-banks/me/donations
  app.post(
    '/me/donations',
    {
      config: {
        auth: true,
        roles: ['blood_bank']
      },
      preHandler: [authenticate, authorize('blood_bank')],
      schema: {
        tags: ['Blood Banks'],
        summary: 'Record a completed blood donation, updating donor cooldown and inventory atomically',
        body: recordDonationSchema,
        response: {
          201: recordDonationResponseSchema
        }
      }
    },
    (req, reply) => controller.recordDonation(req, reply)
  );

  // 4. POST /v1/blood-banks/donors/:id/defer
  app.post<{ Params: { id: string } }>(
    '/donors/:id/defer',
    {
      config: {
        auth: true,
        roles: ['blood_bank']
      },
      preHandler: [authenticate, authorize('blood_bank')],
      schema: {
        tags: ['Blood Banks'],
        summary: 'Clinically defer a donor until a future date with reason',
        params: donorParamSchema,
        body: deferDonorSchema,
        response: {
          200: deferDonorResponseSchema
        }
      }
    },
    (req, reply) => controller.deferDonor(req, reply)
  );

  // 5. POST /v1/blood-banks/me/donors/:id/defer (alias)
  app.post<{ Params: { id: string } }>(
    '/me/donors/:id/defer',
    {
      config: {
        auth: true,
        roles: ['blood_bank']
      },
      preHandler: [authenticate, authorize('blood_bank')],
      schema: {
        tags: ['Blood Banks'],
        summary: 'Clinically defer a donor until a future date with reason',
        params: donorParamSchema,
        body: deferDonorSchema,
        response: {
          200: deferDonorResponseSchema
        }
      }
    },
    (req, reply) => controller.deferDonor(req, reply)
  );

  // 6. Blood Inventory Management (/me/inventory, /me/inventory/adjust)
  await app.register(inventoryRoutes, {
    db,
    config
  });
};
