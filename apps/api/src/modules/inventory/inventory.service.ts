import { ValidationError } from '../../platform/http/errors.js';
import type { AuditService } from '../audit/audit.service.js';
import type {
  AdjustStockInput,
  AdjustStockResult,
  IInventoryRepository,
  InventoryItem,
  InventoryOverview
} from './inventory.types.js';

export class InventoryService {
  constructor(
    private readonly repository: IInventoryRepository,
    private readonly audit?: AuditService,
    private readonly lowStockThreshold: number = 10
  ) {}

  public async getInventory(bloodBankId: string): Promise<InventoryOverview> {
    const rawItems = await this.repository.findInventoryByBank(bloodBankId);

    const items: InventoryItem[] = rawItems.map((item) => ({
      id: item.id,
      bloodBankId: item.bloodBankId,
      bloodGroup: item.bloodGroup,
      component: item.component,
      units: item.units,
      isLowStock: item.units <= this.lowStockThreshold,
      lowStockThreshold: this.lowStockThreshold,
      updatedAt: item.updatedAt.toISOString()
    }));

    const totalUnits = items.reduce((sum, item) => sum + item.units, 0);
    const lowStockCount = items.filter((item) => item.isLowStock).length;

    return {
      bloodBankId,
      items,
      totalUnits,
      lowStockCount
    };
  }

  public async adjustStock(input: AdjustStockInput): Promise<AdjustStockResult> {
    if (input.delta === 0) {
      throw new ValidationError('Adjustment delta cannot be zero');
    }

    const txResult = await this.repository.adjustStockTransaction({
      bloodBankId: input.bloodBankId,
      bloodGroup: input.bloodGroup,
      component: input.component,
      delta: input.delta,
      reason: input.reason,
      requestId: input.requestId
    });

    if (this.audit) {
      await this.audit.record({
        action: 'inventory.adjusted',
        entity: 'blood_inventory',
        entityId: txResult.inventoryId,
        actorUserId: input.actorUserId ?? input.bloodBankId,
        ip: input.ip,
        metadata: {
          bloodGroup: input.bloodGroup,
          component: input.component,
          delta: input.delta,
          reason: input.reason,
          previousUnits: txResult.previousUnits,
          newUnits: txResult.newUnits,
          requestId: input.requestId ?? null
        }
      });
    }

    return {
      inventoryId: txResult.inventoryId,
      bloodBankId: txResult.bloodBankId,
      bloodGroup: txResult.bloodGroup,
      component: txResult.component,
      previousUnits: txResult.previousUnits,
      newUnits: txResult.newUnits,
      delta: txResult.delta,
      reason: txResult.reason,
      requestId: txResult.requestId,
      movementId: txResult.movementId,
      isLowStock: txResult.newUnits <= this.lowStockThreshold,
      lowStockThreshold: this.lowStockThreshold,
      createdAt: txResult.createdAt.toISOString()
    };
  }
}
