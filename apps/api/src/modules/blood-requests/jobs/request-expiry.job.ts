import type PgBoss from 'pg-boss';

export const REQUEST_EXPIRY_JOB_NAME = 'blood-requests.expire-overdue';

export interface ExpiryJobResult {
  jobName: string;
  expiredCount: number;
  timestamp: string;
}

export interface RequestExpiryService {
  expireOverdueRequests(asOfDate?: Date): Promise<number>;
}

/**
 * Registers and schedules the overdue requests expiry job with pg-boss.
 * Runs every minute to guarantee timely expiry transition without polling loops.
 */
export async function registerRequestExpiryJob(
  boss: PgBoss,
  service: RequestExpiryService
): Promise<string> {
  // 1. Ensure queue exists prior to scheduling (required by pg-boss schema foreign key)
  try {
    await boss.createQueue(REQUEST_EXPIRY_JOB_NAME, {
      name: REQUEST_EXPIRY_JOB_NAME,
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true
    });
  } catch {
    // Queue may already exist or cannot be created concurrently
  }

  // 2. Register worker
  const workerId = await boss.work(REQUEST_EXPIRY_JOB_NAME, async () => {
    const now = new Date();
    const expiredCount = await service.expireOverdueRequests(now);
    return {
      expiredCount,
      timestamp: now.toISOString()
    };
  });

  // 3. Schedule recurring cron (every minute)
  await boss.schedule(
    REQUEST_EXPIRY_JOB_NAME,
    '* * * * *',
    {},
    { tz: 'UTC', retryLimit: 3, retryDelay: 10, retryBackoff: true }
  );

  return workerId;
}

/**
 * Executes a single manual run of the expiry job logic.
 * Useful for deterministic testing and manual reconciliation triggers.
 */
export async function executeExpiryJobOnce(
  service: RequestExpiryService,
  asOfDate?: Date
): Promise<ExpiryJobResult> {
  const targetDate = asOfDate ?? new Date();
  const expiredCount = await service.expireOverdueRequests(targetDate);
  return {
    jobName: REQUEST_EXPIRY_JOB_NAME,
    expiredCount,
    timestamp: targetDate.toISOString()
  };
}
