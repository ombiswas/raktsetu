import { eq, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import { donors, users, donations, bloodBanks } from '../../platform/database/schema.js';
import type {
  IDonorsRepository,
  DonorProfile,
  UpdateDonorProfileInput,
  DonorDonationRecord
} from './donors.types.js';
import type { BloodGroup } from '../matching/domain/blood-compatibility.js';

export class DonorsRepository implements IDonorsRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async findProfileByUserId(userId: string): Promise<DonorProfile | null> {
    const [row] = await this.db
      .select({
        id: donors.userId,
        email: users.email,
        fullName: donors.fullName,
        phone: donors.phone,
        bloodGroup: donors.bloodGroup,
        dateOfBirth: donors.dateOfBirth,
        weightKg: donors.weightKg,
        sex: donors.sex,
        location: donors.location,
        isAvailable: donors.isAvailable,
        availableFrom: donors.availableFrom,
        eligibleAfter: donors.eligibleAfter,
        lastDonationDate: donors.lastDonationDate,
        locationUpdatedAt: donors.locationUpdatedAt,
        consentLocationAt: donors.consentLocationAt,
        createdAt: donors.createdAt,
        updatedAt: donors.updatedAt
      })
      .from(donors)
      .innerJoin(users, eq(donors.userId, users.id))
      .where(eq(donors.userId, userId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
      bloodGroup: row.bloodGroup as BloodGroup,
      dateOfBirth: row.dateOfBirth,
      weightKg: row.weightKg,
      sex: row.sex,
      isAvailable: row.isAvailable,
      availableFrom: row.availableFrom ? row.availableFrom.toISOString() : null,
      eligibleAfter: row.eligibleAfter,
      lastDonationDate: row.lastDonationDate,
      hasLocation: Boolean(row.location && (row.location.latitude !== 0 || row.location.longitude !== 0)),
      locationUpdatedAt: row.locationUpdatedAt ? row.locationUpdatedAt.toISOString() : null,
      consentLocationAt: row.consentLocationAt ? row.consentLocationAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  public async updateProfile(
    userId: string,
    data: UpdateDonorProfileInput
  ): Promise<DonorProfile | null> {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date()
    };

    if (data.fullName !== undefined) {
      updateValues.fullName = data.fullName;
    }
    if (data.phone !== undefined) {
      updateValues.phone = data.phone;
    }
    if (data.weightKg !== undefined) {
      updateValues.weightKg = data.weightKg;
    }
    if (data.isAvailable !== undefined) {
      updateValues.isAvailable = data.isAvailable;
    }
    if (data.availableFrom !== undefined) {
      updateValues.availableFrom = data.availableFrom ? new Date(data.availableFrom) : null;
    }

    const [updated] = await this.db
      .update(donors)
      .set(updateValues)
      .where(eq(donors.userId, userId))
      .returning();

    if (!updated) {
      return null;
    }

    return this.findProfileByUserId(userId);
  }

  public async updateLocation(
    userId: string,
    data: { latitude: number; longitude: number; consentedAt: Date }
  ): Promise<{ locationUpdatedAt: Date } | null> {
    const now = new Date();

    const [updated] = await this.db
      .update(donors)
      .set({
        location: {
          latitude: data.latitude,
          longitude: data.longitude
        },
        locationUpdatedAt: now,
        consentLocationAt: data.consentedAt,
        updatedAt: now
      })
      .where(eq(donors.userId, userId))
      .returning({ locationUpdatedAt: donors.locationUpdatedAt });

    if (!updated || !updated.locationUpdatedAt) {
      return null;
    }

    return { locationUpdatedAt: updated.locationUpdatedAt };
  }

  public async getDonationHistory(userId: string): Promise<DonorDonationRecord[]> {
    const rows = await this.db
      .select({
        id: donations.id,
        bloodBankId: donations.bloodBankId,
        bloodBankName: bloodBanks.name,
        requestId: donations.requestId,
        donatedAt: donations.donatedAt,
        units: donations.units
      })
      .from(donations)
      .innerJoin(bloodBanks, eq(donations.bloodBankId, bloodBanks.userId))
      .where(eq(donations.donorId, userId))
      .orderBy(desc(donations.donatedAt));

    return rows.map((row) => ({
      id: row.id,
      bloodBankId: row.bloodBankId,
      bloodBankName: row.bloodBankName,
      requestId: row.requestId,
      donatedAt: row.donatedAt.toISOString(),
      units: row.units
    }));
  }
}
