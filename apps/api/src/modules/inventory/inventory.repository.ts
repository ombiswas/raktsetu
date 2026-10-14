import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import { bloodInventory, inventoryMovements } from '../../platform/database/schema.js';
import { ValidationError } from '../../platform/http/errors.js';
import type {
  BloodComponent,
  BloodGroup,
  IInventoryRepository
} from './inventory.types.js';

export class InventoryRepository implements IInventoryRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async findInventoryByBank(bankId: string) {
    const rows = await this.db
      .select()
      .from(bloodInventory)
      .where(eq(bloodInventory.bloodBankId, bankId))
      .orderBy(bloodInventory.bloodGroup, bloodInventory.component);

    return rows.map((r) => ({
      id: r.id,
      bloodBankId: r.bloodBankId,
      bloodGroup: r.bloodGroup as BloodGroup,
      component: r.component as BloodComponent,
      units: r.units,
      updatedAt: r.updatedAt
    }));
  }

  public async adjustStockTransaction(params: {
    bloodBankId: string;
    bloodGroup: BloodGroup;
    component: BloodComponent;
    delta: number;
    reason: string;
    requestId?: string | null | undefined;
  }) {
    return this.db.transaction(async (tx) => {
      // 1. Concurrency control: select with row-level lock (FOR UPDATE)
      const [existing] = await tx
        .select()
        .from(bloodInventory)
        .where(
          and(
            eq(bloodInventory.bloodBankId, params.bloodBankId),
            eq(bloodInventory.bloodGroup, params.bloodGroup),
            eq(bloodInventory.component, params.component)
          )
        )
        .for('update');

      let inventoryId: string;
      const previousUnits = existing?.units ?? 0;
      let newUnits: number;

      if (!existing) {
        if (params.delta < 0) {
          throw new ValidationError(
            `Insufficient stock: current stock is 0, cannot reduce by ${Math.abs(params.delta)} units`
          );
        }
        newUnits = params.delta;
        const [created] = await tx
          .insert(bloodInventory)
          .values({
            bloodBankId: params.bloodBankId,
            bloodGroup: params.bloodGroup,
            component: params.component,
            units: newUnits,
            updatedAt: new Date()
          })
          .returning();

        if (!created) {
          throw new Error('Failed to create inventory item row');
        }
        inventoryId = created.id;
      } else {
        newUnits = existing.units + params.delta;
        if (newUnits < 0) {
          throw new ValidationError(
            `Insufficient stock: current stock is ${existing.units}, cannot reduce by ${Math.abs(params.delta)} units`
          );
        }
        const [updated] = await tx
          .update(bloodInventory)
          .set({
            units: newUnits,
            updatedAt: new Date()
          })
          .where(eq(bloodInventory.id, existing.id))
          .returning();

        if (!updated) {
          throw new Error('Failed to update inventory stock row');
        }
        inventoryId = updated.id;
      }

      // 2. Insert audited movement row
      const [movement] = await tx
        .insert(inventoryMovements)
        .values({
          inventoryId,
          delta: params.delta,
          reason: params.reason,
          requestId: params.requestId ?? null
        })
        .returning();

      if (!movement) {
        throw new Error('Failed to insert inventory movement record');
      }

      return {
        inventoryId,
        bloodBankId: params.bloodBankId,
        bloodGroup: params.bloodGroup,
        component: params.component,
        previousUnits,
        newUnits,
        delta: params.delta,
        reason: params.reason,
        requestId: params.requestId ?? null,
        movementId: movement.id,
        createdAt: movement.createdAt
      };
    });
  }
}
