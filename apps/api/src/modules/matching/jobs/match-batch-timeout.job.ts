/**
 * Match Batch Timeout pg-boss Job
 * Handles scheduled candidate batch timeouts and triggers expansion to the next tier.
 */

import type PgBoss from 'pg-boss';
import type {
  BatchExpansionUseCase,
  BatchExpansionInput,
  BatchExpansionResult
} from '../application/batch-expansion.usecase.js';

export const MATCH_BATCH_TIMEOUT_JOB_NAME = 'matching.batch-timeout';

export interface BatchTimeoutJobData {
  requestId: string;
  runId: string;
  batchNo: number;
}

/**
 * Registers the pg-boss worker for candidate batch escalation.
 */
export async function registerMatchBatchTimeoutJob(
  boss: PgBoss,
  useCase: BatchExpansionUseCase
): Promise<string> {
  try {
    await boss.createQueue(MATCH_BATCH_TIMEOUT_JOB_NAME);
  } catch {
    // Queue may already exist
  }

  const workerId = await boss.work<BatchTimeoutJobData>(
    MATCH_BATCH_TIMEOUT_JOB_NAME,
    async ([job]) => {
      if (!job) return;
      const { requestId, runId, batchNo } = job.data;
      return useCase.execute({
        requestId,
        runId,
        batchNo
      });
    }
  );

  return workerId;
}

/**
 * Executes a single manual run of the batch timeout escalation logic.
 * Essential for deterministic integration tests with fake timers or without running pg-boss worker.
 */
export async function executeBatchTimeoutOnce(
  useCase: BatchExpansionUseCase,
  input: BatchExpansionInput
): Promise<BatchExpansionResult> {
  return useCase.execute(input);
}
