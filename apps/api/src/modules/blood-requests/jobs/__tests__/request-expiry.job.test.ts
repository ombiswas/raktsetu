import { describe, it, expect, vi, beforeEach } from 'vitest';
import type PgBoss from 'pg-boss';
import {
  registerRequestExpiryJob,
  executeExpiryJobOnce,
  REQUEST_EXPIRY_JOB_NAME,
  type RequestExpiryService
} from '../request-expiry.job.js';

describe('Request Expiry Job Unit Tests', () => {
  let mockBoss: Partial<PgBoss>;
  let mockService: Partial<RequestExpiryService>;
  let registeredWorkerHandler: ((jobs?: unknown) => Promise<unknown>) | null;

  beforeEach(() => {
    registeredWorkerHandler = null;

    mockBoss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      work: vi.fn().mockImplementation((_name, handler) => {
        registeredWorkerHandler = handler;
        return Promise.resolve('mock-worker-id-1234');
      }),
      schedule: vi.fn().mockResolvedValue(undefined)
    };

    mockService = {
      expireOverdueRequests: vi.fn().mockResolvedValue(3)
    };
  });

  describe('registerRequestExpiryJob', () => {
    it('creates queue, registers worker, and schedules recurring cron', async () => {
      const workerId = await registerRequestExpiryJob(
        mockBoss as PgBoss,
        mockService as RequestExpiryService
      );

      expect(mockBoss.createQueue).toHaveBeenCalledWith(REQUEST_EXPIRY_JOB_NAME);
      expect(mockBoss.work).toHaveBeenCalledWith(
        REQUEST_EXPIRY_JOB_NAME,
        expect.any(Function)
      );
      expect(mockBoss.schedule).toHaveBeenCalledWith(
        REQUEST_EXPIRY_JOB_NAME,
        '* * * * *',
        {},
        { tz: 'UTC' }
      );
      expect(workerId).toBe('mock-worker-id-1234');
    });

    it('gracefully tolerates queue already existing when createQueue rejects', async () => {
      mockBoss.createQueue = vi.fn().mockRejectedValue(new Error('Queue already exists'));

      const workerId = await registerRequestExpiryJob(
        mockBoss as PgBoss,
        mockService as RequestExpiryService
      );

      expect(mockBoss.createQueue).toHaveBeenCalledWith(REQUEST_EXPIRY_JOB_NAME);
      expect(mockBoss.work).toHaveBeenCalled();
      expect(mockBoss.schedule).toHaveBeenCalled();
      expect(workerId).toBe('mock-worker-id-1234');
    });

    it('worker handler executes expireOverdueRequests and returns count and timestamp', async () => {
      await registerRequestExpiryJob(
        mockBoss as PgBoss,
        mockService as RequestExpiryService
      );

      expect(registeredWorkerHandler).toBeDefined();
      const result = await registeredWorkerHandler!();

      expect(mockService.expireOverdueRequests).toHaveBeenCalledWith(expect.any(Date));
      expect(result).toEqual({
        expiredCount: 3,
        timestamp: expect.any(String)
      });
    });
  });

  describe('executeExpiryJobOnce', () => {
    it('executes service with specific asOfDate', async () => {
      const customDate = new Date('2026-06-01T12:00:00Z');
      const result = await executeExpiryJobOnce(
        mockService as RequestExpiryService,
        customDate
      );

      expect(mockService.expireOverdueRequests).toHaveBeenCalledWith(customDate);
      expect(result).toEqual({
        jobName: REQUEST_EXPIRY_JOB_NAME,
        expiredCount: 3,
        timestamp: customDate.toISOString()
      });
    });

    it('executes service with current date when asOfDate is omitted', async () => {
      const before = new Date();
      const result = await executeExpiryJobOnce(mockService as RequestExpiryService);
      const after = new Date();

      expect(mockService.expireOverdueRequests).toHaveBeenCalledWith(expect.any(Date));
      expect(result.jobName).toBe(REQUEST_EXPIRY_JOB_NAME);
      expect(result.expiredCount).toBe(3);
      const resultDate = new Date(result.timestamp).getTime();
      expect(resultDate).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate).toBeLessThanOrEqual(after.getTime());
    });
  });
});
