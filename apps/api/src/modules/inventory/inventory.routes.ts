import type { FastifyPluginAsync } from 'fastify';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import { AuditService } from '../audit/audit.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';
import { InventoryController } from './inventory.controller.js';
import {
  adjustInventoryResponseSchema,
  adjustInventorySchema,
  inventoryListResponseSchema
} from './inventory.schema.js';

export interface InventoryRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: InventoryService | undefined;
}

export const inventoryRoutes: FastifyPluginAsync<InventoryRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const repository = new InventoryRepository(db);
  const audit = new AuditService(db, config);
  const threshold = config.INVENTORY_LOW_STOCK_THRESHOLD ?? 10;
  const service = options.service ?? new InventoryService(repository, audit, threshold);
  const controller = new InventoryController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /me/inventory (relative to /v1/blood-banks -> /v1/blood-banks/me/inventory)
  app.get(
    '/me/inventory',
    {
      config: {
        auth: true,
        roles: ['blood_bank']
      },
      preHandler: [authenticate, authorize('blood_bank')],
      schema: {
        tags: ['Blood Banks', 'Inventory'],
        summary: 'Get authenticated blood bank inventory stock and low-stock alerts',
        response: {
          200: inventoryListResponseSchema
        }
      }
    },
    (req, reply) => controller.getMyInventory(req, reply)
  );

  // 2. POST /me/inventory/adjust (relative to /v1/blood-banks -> /v1/blood-banks/me/inventory/adjust)
  app.post(
    '/me/inventory/adjust',
    {
      config: {
        auth: true,
        roles: ['blood_bank']
      },
      preHandler: [authenticate, authorize('blood_bank')],
      schema: {
        tags: ['Blood Banks', 'Inventory'],
        summary: 'Adjust blood inventory stock with audited movement',
        body: adjustInventorySchema,
        response: {
          200: adjustInventoryResponseSchema
        }
      }
    },
    (req, reply) => controller.adjustStock(req, reply)
  );
};
