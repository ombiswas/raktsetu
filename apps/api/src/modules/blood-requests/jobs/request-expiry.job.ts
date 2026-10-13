import type PgBoss from 'pg-boss';
import type { BloodRequestsService } from '../blood-requests.service.js';

export const REQUEST_EXPIRY_JOB_NAME = 'blood-requests.expire-overdue';

export interface ExpiryJobResult {
  jobName: string;
  expiredCount: number;
  timestamp: string;
}

/**
 * Registers and schedules the overdue requests expiry job with pg-boss.
 * Runs every minute to guarantee timely expiry transition without polling loops.
 */
export async function registerRequestExpiryJob(
  boss: PgBoss,
  service: BloodRequestsService
): Promise<void> {
  // 1. Register worker
  await boss.work(REQUEST_EXPIRY_JOB_NAME, async () => {
    const expiredCount = await service.expireOverdueRequests();
    return {
      expiredCount,
      timestamp: new Date().toISOString()
    };
  });

  // 2. Schedule recurring cron (every minute)
  await boss.schedule(REQUEST_EXPIRY_JOB_NAME, '* * * * *', {}, { tz: 'UTC' });
}

/**
 * Executes a single manual run of the expiry job logic.
 * Useful for deterministic testing and manual reconciliation triggers.
 */
export async function executeExpiryJobOnce(
  service: BloodRequestsService,
  asOfDate?: Date
): Promise<ExpiryJobResult> {
  const expiredCount = await service.expireOverdueRequests(asOfDate);
  return {
    jobName: REQUEST_EXPIRY_JOB_NAME,
    expiredCount,
    timestamp: (asOfDate ?? new Date()).toISOString()
  };
}
