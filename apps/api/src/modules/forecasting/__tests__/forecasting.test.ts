import type PgBoss from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForecastingService } from '../forecasting.service.js';
import type {
  IForecastingMlClient,
  IForecastingRepository,
  StoredForecastRow
} from '../forecasting.types.js';
import {
  executeDemandForecastingJobOnce,
  registerDemandForecastingJob,
  FORECASTING_NIGHTLY_JOB_NAME
} from '../jobs/forecasting.job.js';

describe('ForecastingService Unit Tests', () => {
  let repository: IForecastingRepository;
  let mlClient: IForecastingMlClient;
  let service: ForecastingService;

  beforeEach(() => {
    repository = {
      getDailyAggregatedDemand: vi.fn().mockResolvedValue([
        {
          date: '2026-10-10',
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 14
        },
        {
          date: '2026-10-11',
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 8
        }
      ]),
      upsertDemandForecasts: vi.fn().mockResolvedValue(7),
      getLatestForecasts: vi.fn().mockResolvedValue([])
    };

    mlClient = {
      forecastDemand: vi.fn().mockResolvedValue({
        modelVersion: 'v0.2.0-trained-xgboost',
        horizon: 7,
        forecast: [
          { step: 1, date: '2026-10-15', predictedUnits: 11.2 },
          { step: 2, date: '2026-10-16', predictedUnits: 9.8 },
          { step: 3, date: '2026-10-17', predictedUnits: 14.0 },
          { step: 4, date: '2026-10-18', predictedUnits: 7.5 },
          { step: 5, date: '2026-10-19', predictedUnits: 10.1 },
          { step: 6, date: '2026-10-20', predictedUnits: 8.4 },
          { step: 7, date: '2026-10-21', predictedUnits: 12.0 }
        ]
      })
    };

    service = new ForecastingService(repository, mlClient, {
      historyDays: 14,
      forecastHorizon: 7
    });
  });

  describe('executeNightlyForecast', () => {
    it('aggregates daily demand, builds full continuous series, and upserts forecasts for all combinations', async () => {
      const fixedAsOf = new Date('2026-10-14T00:00:00.000Z');
      const result = await service.executeNightlyForecast(fixedAsOf);

      // 8 blood groups * 4 components = 32 combinations
      expect(result.processedCombinations).toBe(32);
      expect(result.updatedForecasts).toBe(32 * 7);
      expect(result.retainedForecasts).toBe(0);

      expect(mlClient.forecastDemand).toHaveBeenCalledTimes(32);
      expect(repository.upsertDemandForecasts).toHaveBeenCalledTimes(32);

      // Check first call parameters
      const firstCallArgs = vi.mocked(mlClient.forecastDemand).mock.calls[0]![0];
      expect(firstCallArgs.horizon).toBe(7);
      expect(firstCallArgs.series.length).toBeGreaterThanOrEqual(14);
      // All dates in series should have valid format YYYY-MM-DD
      expect(firstCallArgs.series.every((pt) => /^\d{4}-\d{2}-\d{2}$/.test(pt.date))).toBe(true);
    });

    it('gracefully retains previous forecast and logs when ML service is unavailable', async () => {
      const warnSpy = vi.fn();
      const mockLogger = {
        warn: warnSpy,
        info: vi.fn(),
        error: vi.fn()
      } as unknown as FastifyBaseLogger;

      const resilientService = new ForecastingService(repository, mlClient, {
        historyDays: 7,
        forecastHorizon: 7,
        logger: mockLogger
      });

      // Simulate ML failure for all requests
      vi.mocked(mlClient.forecastDemand).mockRejectedValue(new Error('ML connection refused 503'));

      const result = await resilientService.executeNightlyForecast(new Date('2026-10-14T00:00:00.000Z'));

      expect(result.processedCombinations).toBe(32);
      expect(result.updatedForecasts).toBe(0);
      expect(result.retainedForecasts).toBe(32);

      // No forecasts were overwritten
      expect(repository.upsertDemandForecasts).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(32);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ bloodGroup: 'A+', component: 'whole_blood' }),
        expect.stringMatching(/ML demand forecast endpoint call failed/i)
      );
    });

    it('ensures forecast job idempotency when executed repeatedly on the same day', async () => {
      const fixedAsOf = new Date('2026-10-14T00:00:00.000Z');

      // First run
      const run1 = await service.executeNightlyForecast(fixedAsOf);
      expect(run1.updatedForecasts).toBe(32 * 7);

      // Second run on same day: upsertDemandForecasts is called with same horizonStart targets
      const run2 = await service.executeNightlyForecast(fixedAsOf);
      expect(run2.updatedForecasts).toBe(32 * 7);

      // Total repository upsert calls were 64, each passing identical key targets for ON CONFLICT DO UPDATE
      expect(repository.upsertDemandForecasts).toHaveBeenCalledTimes(64);
    });
  });

  describe('getForecastOverview', () => {
    it('returns continuous history series, stored forecast points, and model version', async () => {
      const mockStored: StoredForecastRow[] = [
        {
          id: 'fc-1',
          bloodGroup: 'O+',
          component: 'whole_blood',
          horizonStart: new Date('2026-10-15T00:00:00.000Z'),
          horizonEnd: new Date('2026-10-15T23:59:59.999Z'),
          predictedUnits: 15.5,
          modelVersion: 'v0.2.0-sarima-calibrated',
          createdAt: new Date('2026-10-14T00:00:00.000Z')
        },
        {
          id: 'fc-2',
          bloodGroup: 'O+',
          component: 'whole_blood',
          horizonStart: new Date('2026-10-16T00:00:00.000Z'),
          horizonEnd: new Date('2026-10-16T23:59:59.999Z'),
          predictedUnits: 18.2,
          modelVersion: 'v0.2.0-sarima-calibrated',
          createdAt: new Date('2026-10-14T00:00:00.000Z')
        }
      ];

      vi.mocked(repository.getLatestForecasts).mockResolvedValue(mockStored);

      const overview = await service.getForecastOverview({
        bloodGroup: 'O+',
        component: 'whole_blood',
        days: 14,
        asOfDate: new Date('2026-10-14T00:00:00.000Z')
      });

      expect(overview.bloodGroup).toBe('O+');
      expect(overview.component).toBe('whole_blood');
      expect(overview.modelVersion).toBe('v0.2.0-sarima-calibrated');
      expect(overview.isSimulation).toBe(true);

      expect(overview.forecast).toHaveLength(2);
      expect(overview.forecast[0]).toEqual({
        step: 1,
        date: '2026-10-15',
        predictedUnits: 15.5
      });
      expect(overview.forecast[1]).toEqual({
        step: 2,
        date: '2026-10-16',
        predictedUnits: 18.2
      });

      expect(overview.series.length).toBeGreaterThanOrEqual(14);
    });
  });

  describe('pg-boss Demand Forecasting Job Runner', () => {
    it('registers queue, worker, and cron schedule', async () => {
      const mockBoss = {
        createQueue: vi.fn().mockResolvedValue('ok'),
        work: vi.fn().mockResolvedValue('worker-forecasting-123'),
        schedule: vi.fn().mockResolvedValue('schedule-123')
      };

      const workerId = await registerDemandForecastingJob(
        mockBoss as unknown as PgBoss,
        service
      );

      expect(workerId).toBe('worker-forecasting-123');
      expect(mockBoss.createQueue).toHaveBeenCalledWith(FORECASTING_NIGHTLY_JOB_NAME);
      expect(mockBoss.work).toHaveBeenCalledWith(FORECASTING_NIGHTLY_JOB_NAME, expect.any(Function));
      expect(mockBoss.schedule).toHaveBeenCalledWith(
        FORECASTING_NIGHTLY_JOB_NAME,
        '0 0 * * *',
        {},
        { tz: 'UTC' }
      );
    });

    it('executes single run deterministic trigger via executeDemandForecastingJobOnce', async () => {
      const asOf = new Date('2026-10-14T00:00:00.000Z');
      const result = await executeDemandForecastingJobOnce(service, { asOfDate: asOf });

      expect(result.jobName).toBe(FORECASTING_NIGHTLY_JOB_NAME);
      expect(result.processedCombinations).toBe(32);
      expect(result.timestamp).toBe(asOf.toISOString());
    });
  });
});
