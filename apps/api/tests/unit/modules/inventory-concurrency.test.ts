import { describe, it, expect, vi } from 'vitest';
import { InventoryService } from '../../../src/modules/inventory/inventory.service.js';
import type { IInventoryRepository } from '../../../src/modules/inventory/inventory.types.js';
import { ValidationError } from '../../../src/platform/http/errors.js';

describe('Inventory Concurrency & Negative Stock Guard Tests', () => {
  const bankId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('rejects adjustment when delta would cause stock to go negative', async () => {
    const mockRepo: IInventoryRepository = {
      findInventoryByBank: vi.fn(),
      adjustStockTransaction: vi.fn().mockImplementation(async (params) => {
        const currentUnits = 5;
        if (currentUnits + params.delta < 0) {
          throw new ValidationError(
            `Insufficient stock: current stock is ${currentUnits}, cannot reduce by ${Math.abs(params.delta)} units`
          );
        }
        return {
          inventoryId: 'inv-1',
          bloodBankId: params.bloodBankId,
          bloodGroup: params.bloodGroup,
          component: params.component,
          previousUnits: currentUnits,
          newUnits: currentUnits + params.delta,
          delta: params.delta,
          reason: params.reason,
          requestId: null,
          movementId: 'mov-1',
          createdAt: new Date()
        };
      })
    };

    const service = new InventoryService(mockRepo, undefined, 10);

    // Current stock is 5, attempting to deduct 6
    await expect(
      service.adjustStock({
        bloodBankId: bankId,
        bloodGroup: 'O+',
        component: 'whole_blood',
        delta: -6,
        reason: 'Emergency dispatch'
      })
    ).rejects.toThrow(/insufficient stock/i);
  });

  it('maintains strict consistency under concurrent adjustments using serialized locking simulation', async () => {
    // Simulate PostgreSQL row-level lock (SELECT ... FOR UPDATE)
    // where concurrent transactions queue for the lock, update stock atomically,
    // and reject any transaction once stock falls below the requested deduction.
    let simulatedDbStock = 10;
    let lockPromise = Promise.resolve();

    const mockRepo: IInventoryRepository = {
      findInventoryByBank: vi.fn(),
      adjustStockTransaction: vi.fn().mockImplementation(async (params) => {
        // Enqueue behind any in-flight transaction holding the row lock
        const previousLock = lockPromise;
        let releaseLock: () => void = () => {};
        lockPromise = new Promise((resolve) => {
          releaseLock = resolve;
        });

        await previousLock;

        try {
          // Simulate latency inside the transaction under lock
          await new Promise((res) => setTimeout(res, 5));

          const current = simulatedDbStock;
          if (current + params.delta < 0) {
            throw new ValidationError(
              `Insufficient stock: current stock is ${current}, cannot reduce by ${Math.abs(params.delta)} units`
            );
          }

          simulatedDbStock = current + params.delta;

          return {
            inventoryId: 'inv-concurrent-1',
            bloodBankId: params.bloodBankId,
            bloodGroup: params.bloodGroup,
            component: params.component,
            previousUnits: current,
            newUnits: simulatedDbStock,
            delta: params.delta,
            reason: params.reason,
            requestId: null,
            movementId: `mov-${Math.random()}`,
            createdAt: new Date()
          };
        } finally {
          releaseLock();
        }
      })
    };

    const service = new InventoryService(mockRepo, undefined, 5);

    // Initial stock is 10.
    // Concurrently fire 4 requests each attempting to deduct 4 units.
    // Total attempted deductions = 16 units.
    // Exactly 2 requests should succeed (10 - 4 - 4 = 2 remaining),
    // and the other 2 should be rejected with InsufficientStock error.
    const concurrentRequests = [
      service.adjustStock({
        bloodBankId: bankId,
        bloodGroup: 'B+',
        component: 'platelets',
        delta: -4,
        reason: 'Concurrent request 1'
      }),
      service.adjustStock({
        bloodBankId: bankId,
        bloodGroup: 'B+',
        component: 'platelets',
        delta: -4,
        reason: 'Concurrent request 2'
      }),
      service.adjustStock({
        bloodBankId: bankId,
        bloodGroup: 'B+',
        component: 'platelets',
        delta: -4,
        reason: 'Concurrent request 3'
      }),
      service.adjustStock({
        bloodBankId: bankId,
        bloodGroup: 'B+',
        component: 'platelets',
        delta: -4,
        reason: 'Concurrent request 4'
      })
    ];

    const results = await Promise.allSettled(concurrentRequests);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(2);

    // Final stock must remain strictly non-negative and equal to 2
    expect(simulatedDbStock).toBe(2);

    // Both rejections must have failed with insufficient stock
    for (const rej of rejected) {
      if (rej.status === 'rejected') {
        expect(rej.reason.message).toMatch(/insufficient stock/i);
      }
    }
  });
});
