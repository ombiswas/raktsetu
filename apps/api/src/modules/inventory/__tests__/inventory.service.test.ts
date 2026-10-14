import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../inventory.service.js';
import type { IInventoryRepository } from '../inventory.types.js';
import type { AuditService } from '../../audit/audit.service.js';
import { ValidationError } from '../../../platform/http/errors.js';

describe('InventoryService Unit Tests', () => {
  let repository: IInventoryRepository;
  let audit: AuditService;
  let service: InventoryService;

  const mockBankId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    repository = {
      findInventoryByBank: vi.fn(),
      adjustStockTransaction: vi.fn()
    };
    audit = {
      record: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuditService;
    service = new InventoryService(repository, audit, 10); // threshold = 10
  });

  describe('getInventory', () => {
    it('returns inventory overview with correct low-stock flags and totals', async () => {
      vi.mocked(repository.findInventoryByBank).mockResolvedValue([
        {
          id: 'inv-1',
          bloodBankId: mockBankId,
          bloodGroup: 'A+',
          component: 'whole_blood',
          units: 5, // <= 10 -> isLowStock: true
          updatedAt: new Date('2026-03-01T10:00:00.000Z')
        },
        {
          id: 'inv-2',
          bloodBankId: mockBankId,
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 25, // > 10 -> isLowStock: false
          updatedAt: new Date('2026-03-01T10:00:00.000Z')
        },
        {
          id: 'inv-3',
          bloodBankId: mockBankId,
          bloodGroup: 'B-',
          component: 'platelets',
          units: 10, // == 10 -> isLowStock: true
          updatedAt: new Date('2026-03-01T10:00:00.000Z')
        }
      ]);

      const result = await service.getInventory(mockBankId);

      expect(result.bloodBankId).toBe(mockBankId);
      expect(result.totalUnits).toBe(40);
      expect(result.lowStockCount).toBe(2);
      expect(result.items).toHaveLength(3);

      expect(result.items[0]).toMatchObject({
        bloodGroup: 'A+',
        units: 5,
        isLowStock: true,
        lowStockThreshold: 10
      });
      expect(result.items[1]).toMatchObject({
        bloodGroup: 'O+',
        units: 25,
        isLowStock: false
      });
      expect(result.items[2]).toMatchObject({
        bloodGroup: 'B-',
        units: 10,
        isLowStock: true
      });
    });

    it('returns empty overview when bank has no stock entries yet', async () => {
      vi.mocked(repository.findInventoryByBank).mockResolvedValue([]);

      const result = await service.getInventory(mockBankId);

      expect(result.items).toEqual([]);
      expect(result.totalUnits).toBe(0);
      expect(result.lowStockCount).toBe(0);
    });
  });

  describe('adjustStock', () => {
    it('successfully credits inventory stock and logs audit record', async () => {
      const now = new Date('2026-03-01T12:00:00.000Z');
      vi.mocked(repository.adjustStockTransaction).mockResolvedValue({
        inventoryId: 'inv-1',
        bloodBankId: mockBankId,
        bloodGroup: 'O-',
        component: 'rbc',
        previousUnits: 4,
        newUnits: 14,
        delta: 10,
        reason: 'Restock shipment',
        requestId: null,
        movementId: 'mov-1',
        createdAt: now
      });

      const result = await service.adjustStock({
        bloodBankId: mockBankId,
        bloodGroup: 'O-',
        component: 'rbc',
        delta: 10,
        reason: 'Restock shipment',
        actorUserId: 'admin-user-id',
        ip: '127.0.0.1'
      });

      expect(result.previousUnits).toBe(4);
      expect(result.newUnits).toBe(14);
      expect(result.delta).toBe(10);
      expect(result.isLowStock).toBe(false); // 14 > 10

      expect(audit.record).toHaveBeenCalledWith({
        action: 'inventory.adjusted',
        entity: 'blood_inventory',
        entityId: 'inv-1',
        actorUserId: 'admin-user-id',
        ip: '127.0.0.1',
        metadata: {
          bloodGroup: 'O-',
          component: 'rbc',
          delta: 10,
          reason: 'Restock shipment',
          previousUnits: 4,
          newUnits: 14,
          requestId: null
        }
      });
    });

    it('successfully debits inventory stock and triggers low stock alert if below threshold', async () => {
      const now = new Date('2026-03-01T12:00:00.000Z');
      vi.mocked(repository.adjustStockTransaction).mockResolvedValue({
        inventoryId: 'inv-1',
        bloodBankId: mockBankId,
        bloodGroup: 'A+',
        component: 'platelets',
        previousUnits: 12,
        newUnits: 4,
        delta: -8,
        reason: 'Issued for emergency request',
        requestId: 'req-uuid',
        movementId: 'mov-2',
        createdAt: now
      });

      const result = await service.adjustStock({
        bloodBankId: mockBankId,
        bloodGroup: 'A+',
        component: 'platelets',
        delta: -8,
        reason: 'Issued for emergency request',
        requestId: 'req-uuid',
        actorUserId: mockBankId
      });

      expect(result.previousUnits).toBe(12);
      expect(result.newUnits).toBe(4);
      expect(result.delta).toBe(-8);
      expect(result.isLowStock).toBe(true); // 4 <= 10
    });

    it('rejects delta of 0 before hitting repository', async () => {
      await expect(
        service.adjustStock({
          bloodBankId: mockBankId,
          bloodGroup: 'A+',
          component: 'whole_blood',
          delta: 0,
          reason: 'Zero delta'
        })
      ).rejects.toThrow(ValidationError);

      expect(repository.adjustStockTransaction).not.toHaveBeenCalled();
    });

    it('propagates InsufficientStock ValidationError thrown by repository', async () => {
      vi.mocked(repository.adjustStockTransaction).mockRejectedValue(
        new ValidationError('Insufficient stock: current stock is 3, cannot reduce by 5 units')
      );

      await expect(
        service.adjustStock({
          bloodBankId: mockBankId,
          bloodGroup: 'B+',
          component: 'plasma',
          delta: -5,
          reason: 'Over-deduction'
        })
      ).rejects.toThrow(/insufficient stock/i);

      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
