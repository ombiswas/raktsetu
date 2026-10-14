import type { FastifyPluginAsync } from 'fastify';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';
import {
  analyticsOverviewQuerySchema,
  analyticsOverviewResponseSchema
} from './analytics.schema.js';

export interface AnalyticsRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: AnalyticsService | undefined;
}

export const analyticsRoutes: FastifyPluginAsync<AnalyticsRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const repository = new AnalyticsRepository(db);
  const service = options.service ?? new AnalyticsService(repository);
  const controller = new AnalyticsController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /v1/analytics/overview
  app.get(
    '/overview',
    {
      config: {
        auth: true,
        roles: ['admin', 'blood_bank']
      },
      preHandler: [authenticate, authorize('admin', 'blood_bank')],
      schema: {
        tags: ['Analytics'],
        summary: 'Get operational analytics overview metrics',
        querystring: analyticsOverviewQuerySchema,
        response: {
          200: analyticsOverviewResponseSchema
        }
      }
    },
    (req, reply) => controller.getOverview(req, reply)
  );
};
