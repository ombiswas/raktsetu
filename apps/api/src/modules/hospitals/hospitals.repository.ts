import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import { hospitals, users } from '../../platform/database/schema.js';
import type {
  IHospitalsRepository,
  HospitalProfile,
  UpdateHospitalProfileInput
} from './hospitals.types.js';

export class HospitalsRepository implements IHospitalsRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async findProfileByUserId(userId: string): Promise<HospitalProfile | null> {
    const [row] = await this.db
      .select({
        id: hospitals.userId,
        email: users.email,
        name: hospitals.name,
        registrationNo: hospitals.registrationNo,
        phone: hospitals.phone,
        address: hospitals.address,
        verifiedAt: hospitals.verifiedAt,
        createdAt: hospitals.createdAt,
        updatedAt: hospitals.updatedAt
      })
      .from(hospitals)
      .innerJoin(users, eq(hospitals.userId, users.id))
      .where(eq(hospitals.userId, userId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      registrationNo: row.registrationNo,
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
    data: UpdateHospitalProfileInput
  ): Promise<HospitalProfile | null> {
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
      .update(hospitals)
      .set(updateValues)
      .where(eq(hospitals.userId, userId))
      .returning();

    if (!updated) {
      return null;
    }

    return this.findProfileByUserId(userId);
  }
}
