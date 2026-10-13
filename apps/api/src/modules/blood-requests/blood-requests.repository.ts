import { eq, and, desc, inArray, lt, gt } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import {
  bloodRequests,
  hospitals,
  idempotencyKeys,
  type GeoPoint
} from '../../platform/database/schema.js';
import type { RequestStatus } from './domain/state-machine.js';
import type {
  IBloodRequestsRepository,
  BloodRequestRecord,
  BloodRequestFilter,
  HospitalProfileLookup,
  IdempotencyRecord,
  BloodGroup,
  BloodComponent,
  RequestUrgency
} from './blood-requests.types.js';

export class BloodRequestsRepository implements IBloodRequestsRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async findHospitalById(hospitalId: string): Promise<HospitalProfileLookup | null> {
    const [row] = await this.db
      .select({
        id: hospitals.userId,
        name: hospitals.name,
        address: hospitals.address,
        location: hospitals.location,
        verifiedAt: hospitals.verifiedAt
      })
      .from(hospitals)
      .where(eq(hospitals.userId, hospitalId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      address: row.address,
      location: row.location as GeoPoint,
      verifiedAt: row.verifiedAt
    };
  }

  public async createRequest(data: {
    hospitalId: string;
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: RequestUrgency;
    neededBy: Date;
    location: GeoPoint;
  }): Promise<BloodRequestRecord> {
    const [created] = await this.db
      .insert(bloodRequests)
      .values({
        hospitalId: data.hospitalId,
        bloodGroup: data.bloodGroup,
        component: data.component,
        unitsRequired: data.unitsRequired,
        unitsFulfilled: 0,
        urgency: data.urgency,
        status: 'open',
        neededBy: data.neededBy,
        location: data.location
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create blood request record');
    }

    return this.mapToRecord(created);
  }

  public async findRequestById(id: string): Promise<BloodRequestRecord | null> {
    const [row] = await this.db
      .select()
      .from(bloodRequests)
      .where(eq(bloodRequests.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapToRecord(row);
  }

  public async findRequestWithHospitalDetails(
    id: string
  ): Promise<{ request: BloodRequestRecord; hospitalName: string; hospitalAddress: string } | null> {
    const [row] = await this.db
      .select({
        request: bloodRequests,
        hospitalName: hospitals.name,
        hospitalAddress: hospitals.address
      })
      .from(bloodRequests)
      .innerJoin(hospitals, eq(bloodRequests.hospitalId, hospitals.userId))
      .where(eq(bloodRequests.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      request: this.mapToRecord(row.request),
      hospitalName: row.hospitalName,
      hospitalAddress: row.hospitalAddress
    };
  }

  public async listRequestsByHospital(
    hospitalId: string,
    filter?: BloodRequestFilter
  ): Promise<BloodRequestRecord[]> {
    const conditions = [eq(bloodRequests.hospitalId, hospitalId)];

    if (filter?.status) {
      conditions.push(eq(bloodRequests.status, filter.status));
    }

    const rows = await this.db
      .select()
      .from(bloodRequests)
      .where(and(...conditions))
      .orderBy(desc(bloodRequests.createdAt))
      .limit(filter?.limit ?? 50)
      .offset(filter?.offset ?? 0);

    return rows.map((r) => this.mapToRecord(r));
  }

  public async listAllRequests(
    filter?: BloodRequestFilter
  ): Promise<Array<{ request: BloodRequestRecord; hospitalName: string; hospitalAddress: string }>> {
    const conditions = [];

    if (filter?.status) {
      conditions.push(eq(bloodRequests.status, filter.status));
    }

    const rows = await this.db
      .select({
        request: bloodRequests,
        hospitalName: hospitals.name,
        hospitalAddress: hospitals.address
      })
      .from(bloodRequests)
      .innerJoin(hospitals, eq(bloodRequests.hospitalId, hospitals.userId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bloodRequests.createdAt))
      .limit(filter?.limit ?? 50)
      .offset(filter?.offset ?? 0);

    return rows.map((r) => ({
      request: this.mapToRecord(r.request),
      hospitalName: r.hospitalName,
      hospitalAddress: r.hospitalAddress
    }));
  }

  public async updateRequestStatus(
    id: string,
    newStatus: RequestStatus
  ): Promise<BloodRequestRecord | null> {
    const [updated] = await this.db
      .update(bloodRequests)
      .set({
        status: newStatus,
        updatedAt: new Date()
      })
      .where(eq(bloodRequests.id, id))
      .returning();

    return updated ? this.mapToRecord(updated) : null;
  }

  public async findAndExpireOverdueRequests(asOfDate: Date): Promise<BloodRequestRecord[]> {
    const expiredRows = await this.db
      .update(bloodRequests)
      .set({
        status: 'expired',
        updatedAt: new Date()
      })
      .where(
        and(
          inArray(bloodRequests.status, ['open', 'matching']),
          lt(bloodRequests.neededBy, asOfDate)
        )
      )
      .returning();

    return expiredRows.map((r) => this.mapToRecord(r));
  }

  public async findIdempotencyKey(key: string, userId: string): Promise<IdempotencyRecord | null> {
    const now = new Date();
    const [row] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.userId, userId),
          gt(idempotencyKeys.expiresAt, now)
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      key: row.key,
      userId: row.userId,
      requestHash: row.requestHash,
      responseCode: row.responseCode,
      responseBody: row.responseBody,
      expiresAt: row.expiresAt
    };
  }

  public async saveIdempotencyKey(record: {
    key: string;
    userId: string;
    requestHash: string;
    responseCode: number;
    responseBody: unknown;
    expiresAt: Date;
  }): Promise<void> {
    await this.db
      .insert(idempotencyKeys)
      .values({
        key: record.key,
        userId: record.userId,
        requestHash: record.requestHash,
        responseCode: record.responseCode,
        responseBody: record.responseBody,
        expiresAt: record.expiresAt
      })
      .onConflictDoNothing();
  }

  private mapToRecord(row: typeof bloodRequests.$inferSelect): BloodRequestRecord {
    return {
      id: row.id,
      hospitalId: row.hospitalId,
      bloodGroup: row.bloodGroup as BloodGroup,
      component: row.component as BloodComponent,
      unitsRequired: row.unitsRequired,
      unitsFulfilled: row.unitsFulfilled,
      urgency: row.urgency as RequestUrgency,
      status: row.status as RequestStatus,
      neededBy: row.neededBy,
      location: row.location as GeoPoint,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
