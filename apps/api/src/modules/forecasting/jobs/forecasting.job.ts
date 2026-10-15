import type PgBoss from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import type { ForecastingService } from '../forecasting.service.js';

export const FORECASTING_NIGHTLY_JOB_NAME = 'demand-forecasting.nightly';

export interface DemandForecastingJobResult {
  jobName: string;
  processedCombinations: number;
  updatedForecasts: number;
  retainedForecasts: number;
  timestamp: string;
}

/**
 * Registers and schedules the nightly demand forecasting job with pg-boss.
 * Runs nightly at 00:00 UTC ('0 0 * * *').
 */
export async function registerDemandForecastingJob(
  boss: PgBoss,
  service: ForecastingService,
  logger?: FastifyBaseLogger
): Promise<string> {
  // 1. Ensure queue exists
  try {
    await boss.createQueue(FORECASTING_NIGHTLY_JOB_NAME, {
      name: FORECASTING_NIGHTLY_JOB_NAME,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true
    });
  } catch {
    // Queue may already exist or cannot be created concurrently
  }

  // 2. Register worker
  const workerId = await boss.work(FORECASTING_NIGHTLY_JOB_NAME, async () => {
    logger?.info('Starting nightly demand forecasting worker execution');
    const result = await service.executeNightlyForecast();
    logger?.info(result, 'Completed nightly demand forecasting worker execution');
    return {
      jobName: FORECASTING_NIGHTLY_JOB_NAME,
      ...result,
      timestamp: new Date().toISOString()
    };
  });

  // 3. Schedule recurring nightly cron at 00:00 UTC
  await boss.schedule(
    FORECASTING_NIGHTLY_JOB_NAME,
    '0 0 * * *',
    {},
    { tz: 'UTC', retryLimit: 3, retryDelay: 30, retryBackoff: true }
  );

  return workerId;
}

/**
 * Executes a single manual run of the nightly forecasting job logic.
 * Useful for deterministic testing, verification, and manual triggers.
 */
export async function executeDemandForecastingJobOnce(
  service: ForecastingService,
  options?: { asOfDate?: Date }
): Promise<DemandForecastingJobResult> {
  const result = await service.executeNightlyForecast(options?.asOfDate);
  return {
    jobName: FORECASTING_NIGHTLY_JOB_NAME,
    ...result,
    timestamp: (options?.asOfDate ?? new Date()).toISOString()
  };
}
