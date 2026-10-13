import { eq, and } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import {
  bloodBanks,
  users,
  donors,
  donations,
  bloodInventory,
  inventoryMovements
} from '../../platform/database/schema.js';
import type {
  IBloodBanksRepository,
  BloodBankProfile,
  UpdateBloodBankProfileInput,
  RecordDonationResult,
  DeferDonorResult,
  SafeDonorSummary,
  BloodComponentType
} from './blood-banks.types.js';
import type { BloodGroup } from '../matching/domain/blood-compatibility.js';

export class BloodBanksRepository implements IBloodBanksRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async findProfileByUserId(userId: string): Promise<BloodBankProfile | null> {
    const [row] = await this.db
      .select({
        id: bloodBanks.userId,
        email: users.email,
        name: bloodBanks.name,
        licenseNo: bloodBanks.licenseNo,
        phone: bloodBanks.phone,
        address: bloodBanks.address,
        verifiedAt: bloodBanks.verifiedAt,
        createdAt: bloodBanks.createdAt,
        updatedAt: bloodBanks.updatedAt
      })
      .from(bloodBanks)
      .innerJoin(users, eq(bloodBanks.userId, users.id))
      .where(eq(bloodBanks.userId, userId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      licenseNo: row.licenseNo,
      phone: row.phone,
      address: row.address,
      isVerified: Boolean(row.verifiedAt),
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  public async updateProfile(
    userId: string,
    data: UpdateBloodBankProfileInput
  ): Promise<BloodBankProfile | null> {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date()
    };

    if (data.phone !== undefined) {
      updateValues.phone = data.phone;
    }
    if (data.address !== undefined) {
      updateValues.address = data.address;
    }

    const [updated] = await this.db
      .update(bloodBanks)
      .set(updateValues)
      .where(eq(bloodBanks.userId, userId))
      .returning();

    if (!updated) {
      return null;
    }

    return this.findProfileByUserId(userId);
  }

  public async findDonorById(donorId: string): Promise<SafeDonorSummary | null> {
    const [row] = await this.db
      .select({
        id: donors.userId,
        bloodGroup: donors.bloodGroup,
        isAvailable: donors.isAvailable,
        eligibleAfter: donors.eligibleAfter,
        lastDonationDate: donors.lastDonationDate
      })
      .from(donors)
      .where(eq(donors.userId, donorId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      bloodGroup: row.bloodGroup as BloodGroup,
      isAvailable: row.isAvailable,
      eligibleAfter: row.eligibleAfter,
      lastDonationDate: row.lastDonationDate
    };
  }

  public async recordDonationTransaction(params: {
    bloodBankId: string;
    donorId: string;
    bloodGroup: BloodGroup;
    component: BloodComponentType;
    units: number;
    requestId?: string | null;
    donatedAt: Date;
  }): Promise<RecordDonationResult> {
    return this.db.transaction(async (tx) => {
      // 1. Insert donation record
      const [donation] = await tx
        .insert(donations)
        .values({
          donorId: params.donorId,
          bloodBankId: params.bloodBankId,
          requestId: params.requestId ?? null,
          donatedAt: params.donatedAt,
          units: params.units
        })
        .returning();

      if (!donation) {
        throw new Error('Failed to create donation record');
      }

      // 2. Update donor last donation date and cooldown
      const donationDateStr = params.donatedAt.toISOString().slice(0, 10);
      const cooldownDays = params.component === 'platelets' ? 14 : 90;
      const nextEligible = new Date(
        params.donatedAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10);

      await tx
        .update(donors)
        .set({
          lastDonationDate: donationDateStr,
          eligibleAfter: nextEligible,
          updatedAt: new Date()
        })
        .where(eq(donors.userId, params.donorId));

      // 3. Upsert blood inventory
      const [existingInv] = await tx
        .select()
        .from(bloodInventory)
        .where(
          and(
            eq(bloodInventory.bloodBankId, params.bloodBankId),
            eq(bloodInventory.bloodGroup, params.bloodGroup),
            eq(bloodInventory.component, params.component)
          )
        )
        .limit(1);

      let inventoryId: string;
      let newTotalUnits: number;

      if (existingInv) {
        inventoryId = existingInv.id;
        newTotalUnits = existingInv.units + params.units;
        await tx
          .update(bloodInventory)
          .set({
            units: newTotalUnits,
            updatedAt: new Date()
          })
          .where(eq(bloodInventory.id, existingInv.id));
      } else {
        newTotalUnits = params.units;
        const [newInv] = await tx
          .insert(bloodInventory)
          .values({
            bloodBankId: params.bloodBankId,
            bloodGroup: params.bloodGroup,
            component: params.component,
            units: newTotalUnits
          })
          .returning({ id: bloodInventory.id });

        if (!newInv) {
          throw new Error('Failed to create inventory record');
        }
        inventoryId = newInv.id;
      }

      // 4. Record inventory movement
      await tx.insert(inventoryMovements).values({
        inventoryId,
        delta: params.units,
        reason: 'DONATION',
        requestId: params.requestId ?? null
      });

      return {
        donationId: donation.id,
        donorId: donation.donorId,
        bloodBankId: donation.bloodBankId,
        bloodGroup: params.bloodGroup,
        component: params.component,
        units: donation.units,
        donatedAt: donation.donatedAt.toISOString(),
        inventoryTotalUnits: newTotalUnits
      };
    });
  }

  public async deferDonor(params: {
    donorId: string;
    eligibleAfter: string;
    reason: string;
    bloodBankUserId: string;
  }): Promise<DeferDonorResult | null> {
    const now = new Date();

    const [updated] = await this.db
      .update(donors)
      .set({
        eligibleAfter: params.eligibleAfter,
        updatedAt: now
      })
      .where(eq(donors.userId, params.donorId))
      .returning({
        donorId: donors.userId,
        bloodGroup: donors.bloodGroup,
        eligibleAfter: donors.eligibleAfter
      });

    if (!updated || !updated.eligibleAfter) {
      return null;
    }

    return {
      donorId: updated.donorId,
      bloodGroup: updated.bloodGroup as BloodGroup,
      eligibleAfter: updated.eligibleAfter,
      deferredAt: now.toISOString(),
      reason: params.reason
    };
  }
}
