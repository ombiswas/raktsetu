import type { FastifyPluginAsync } from 'fastify';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';
import { createAuthenticateGuard, authorize } from '../../platform/http/guards/index.js';
import { ForecastingRepository } from './forecasting.repository.js';
import { ForecastingMlClient } from './forecasting-ml.client.js';
import { ForecastingService } from './forecasting.service.js';
import { ForecastingController } from './forecasting.controller.js';
import {
  forecastOverviewResponseSchema,
  getForecastQuerySchema
} from './forecasting.schema.js';

export interface ForecastingRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: ForecastingService | undefined;
}

export const forecastingRoutes: FastifyPluginAsync<ForecastingRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const repository = new ForecastingRepository(db);
  const mlClient = new ForecastingMlClient({
    baseUrl: config.ML_SERVICE_URL,
    token: config.ML_SERVICE_TOKEN
  });
  const service =
    options.service ??
    new ForecastingService(repository, mlClient, {
      logger: app.log
    });
  const controller = new ForecastingController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. GET /v1/forecasts (or /v1/forecasts/)
  app.get(
    '',
    {
      config: {
        auth: true,
        roles: ['blood_bank', 'admin']
      },
      preHandler: [authenticate, authorize('blood_bank', 'admin')],
      schema: {
        tags: ['Forecasting'],
        summary: 'Get demand time series and multi-day point forecasts',
        querystring: getForecastQuerySchema,
        response: {
          200: forecastOverviewResponseSchema
        }
      }
    },
    (req, reply) => controller.getForecast(req, reply)
  );
};
