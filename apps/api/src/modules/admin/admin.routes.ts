import type { FastifyPluginAsync } from 'fastify';
import { AdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import {
  listAccountsQuerySchema,
  type ListAccountsQuerySchemaInput,
  accountIdParamSchema,
  adminAccountsListResponseSchema,
  adminAccountActionResponseSchema,
  listAuditLogsQuerySchema,
  type ListAuditLogsQuerySchemaInput,
  adminAuditLogsListResponseSchema
} from './admin.schema.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { AuditService } from '../audit/audit.service.js';

export interface AdminRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: AdminService;
}

export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (app, options) => {
  const { db, config } = options;
  const repository = new AdminRepository(db);
  const audit = new AuditService(db, config);
  const service = options.service ?? new AdminService(repository, audit);
  const controller = new AdminController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /v1/admin/accounts?status=pending
  app.get<{ Querystring: ListAccountsQuerySchemaInput }>(
    '/accounts',
    {
      config: {
        auth: true,
        roles: ['admin']
      },
      preHandler: [authenticate, authorize('admin')],
      schema: {
        tags: ['Admin'],
        summary: 'List user accounts filtered by verification status or role',
        querystring: listAccountsQuerySchema,
        response: {
          200: adminAccountsListResponseSchema
        }
      }
    },
    (req, reply) => controller.listAccounts(req, reply)
  );

  // 2. POST /v1/admin/accounts/:id/approve
  app.post<{ Params: { id: string } }>(
    '/accounts/:id/approve',
    {
      config: {
        auth: true,
        roles: ['admin']
      },
      preHandler: [authenticate, authorize('admin')],
      schema: {
        tags: ['Admin'],
        summary: 'Approve a pending organization or user account',
        params: accountIdParamSchema,
        response: {
          200: adminAccountActionResponseSchema
        }
      }
    },
    (req, reply) => controller.approveAccount(req, reply)
  );

  // 3. POST /v1/admin/accounts/:id/suspend
  app.post<{ Params: { id: string } }>(
    '/accounts/:id/suspend',
    {
      config: {
        auth: true,
        roles: ['admin']
      },
      preHandler: [authenticate, authorize('admin')],
      schema: {
        tags: ['Admin'],
        summary: 'Suspend an active account and immediately revoke all active refresh tokens',
        params: accountIdParamSchema,
        response: {
          200: adminAccountActionResponseSchema
        }
      }
    },
    (req, reply) => controller.suspendAccount(req, reply)
  );

  // 4. POST /v1/admin/accounts/:id/reactivate
  app.post<{ Params: { id: string } }>(
    '/accounts/:id/reactivate',
    {
      config: {
        auth: true,
        roles: ['admin']
      },
      preHandler: [authenticate, authorize('admin')],
      schema: {
        tags: ['Admin'],
        summary: 'Reactivate a suspended account',
        params: accountIdParamSchema,
        response: {
          200: adminAccountActionResponseSchema
        }
      }
    },
    (req, reply) => controller.reactivateAccount(req, reply)
  );

  // 5. GET /v1/admin/audit-logs
  app.get<{ Querystring: ListAuditLogsQuerySchemaInput }>(
    '/audit-logs',
    {
      config: {
        auth: true,
        roles: ['admin']
      },
      preHandler: [authenticate, authorize('admin')],
      schema: {
        tags: ['Admin'],
        summary: 'Paginated and filterable read-only access to immutable audit logs',
        querystring: listAuditLogsQuerySchema,
        response: {
          200: adminAuditLogsListResponseSchema
        }
      }
    },
    (req, reply) => controller.listAuditLogs(req, reply)
  );
};
