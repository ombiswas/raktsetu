/**
 * PostGIS Spatial Candidate Repository
 * Enforces strict privacy boundaries:
 * - Computes distances exclusively inside PostGIS using ST_Distance.
 * - Filters geospatial bounds using ST_DWithin on geography Point column (leverages GiST index).
 * - Pre-filters blood groups at the SQL level.
 * - NEVER selects donor latitude or longitude coordinates into application memory.
 */

import { sql, eq, and, inArray, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../../../platform/database/connection.js';
import {
  donors,
  users,
  bloodRequests,
  matchRuns,
  matchCandidates,
  type GeoPoint
} from '../../../platform/database/schema.js';
import type { BloodGroup } from '../domain/compatibility.js';

export interface SpatialCandidateQuery {
  hospitalLocation: GeoPoint;
  compatibleBloodGroups: BloodGroup[];
  radiusMeters: number;
}

export interface CandidateSpatialRecord {
  donorId: string;
  bloodGroup: BloodGroup;
  dateOfBirth: string;
  weightKg: number;
  sex: 'male' | 'female' | 'other';
  isAvailable: boolean;
  availableFrom: Date | null;
  eligibleAfter: string | null;
  lastDonationDate: string | null;
  distanceMeters: number;
  lastRespondedAt: Date | null;
}

export interface BloodRequestLookup {
  id: string;
  hospitalId: string;
  bloodGroup: BloodGroup;
  component: string;
  unitsRequired: number;
  urgency: string;
  status: string;
  neededBy: Date;
  location: GeoPoint;
}

export interface PersistMatchRunInput {
  requestId: string;
  algorithm: 'baseline' | 'hybrid';
  algorithmVersion: string;
  config: Record<string, unknown>;
  modelVersion?: string | null;
  degraded?: boolean;
}

export interface PersistCandidateInput {
  donorId: string;
  rank: number;
  score: number;
  distanceMeters: number;
  travelSeconds?: number | null;
  pResponse?: number | null;
  batchNo?: number;
}

export interface MatchRunRecord {
  id: string;
  requestId: string;
  algorithm: 'baseline' | 'hybrid';
  algorithmVersion: string;
  config: Record<string, unknown>;
  modelVersion: string | null;
  degraded: boolean;
  createdAt: Date;
}

export interface MatchCandidateRecord {
  id: string;
  runId: string;
  donorId: string;
  rank: number;
  score: number | null;
  pResponse: number | null;
  distanceM: number;
  travelSeconds: number | null;
  batchNo: number;
  notifiedAt: Date | null;
  response: 'pending' | 'accepted' | 'declined' | 'no_response';
  respondedAt: Date | null;
  createdAt: Date;
  bloodGroup?: BloodGroup;
}

export interface ISpatialCandidateRepository {
  findCandidatesWithinRadius(query: SpatialCandidateQuery): Promise<CandidateSpatialRecord[]>;
  findRequestById(requestId: string): Promise<BloodRequestLookup | null>;
  persistMatchRun(
    runData: PersistMatchRunInput,
    candidates: PersistCandidateInput[]
  ): Promise<{ run: MatchRunRecord; candidateCount: number }>;
  findLatestRunByRequestId(requestId: string): Promise<MatchRunRecord | null>;
  findCandidatesByRunId(runId: string): Promise<MatchCandidateRecord[]>;
}

export class SpatialCandidateRepository implements ISpatialCandidateRepository {
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * PostGIS geospatial candidate query.
   * Parameterizes ST_DWithin and ST_Distance on geography.
   * Never selects coordinates into application memory.
   */
  public async findCandidatesWithinRadius(
    query: SpatialCandidateQuery
  ): Promise<CandidateSpatialRecord[]> {
    if (query.compatibleBloodGroups.length === 0 || query.radiusMeters <= 0) {
      return [];
    }

    const targetPoint = sql`ST_SetSRID(ST_MakePoint(${query.hospitalLocation.longitude}, ${query.hospitalLocation.latitude}), 4326)::geography`;
    const distanceExpr = sql<number>`ROUND(ST_Distance(${donors.location}, ${targetPoint})::numeric, 1)::float`;
    const withinExpr = sql<boolean>`ST_DWithin(${donors.location}, ${targetPoint}, ${query.radiusMeters})`;
    const lastRespondedAtExpr = sql<Date | null>`(SELECT MAX(mc.responded_at) FROM match_candidates mc WHERE mc.donor_id = ${donors.userId})`;

    const rows = await this.db
      .select({
        donorId: donors.userId,
        bloodGroup: donors.bloodGroup,
        dateOfBirth: donors.dateOfBirth,
        weightKg: donors.weightKg,
        sex: donors.sex,
        isAvailable: donors.isAvailable,
        availableFrom: donors.availableFrom,
        eligibleAfter: donors.eligibleAfter,
        lastDonationDate: donors.lastDonationDate,
        distanceMeters: distanceExpr,
        lastRespondedAt: lastRespondedAtExpr
      })
      .from(donors)
      .innerJoin(users, eq(donors.userId, users.id))
      .where(
        and(
          eq(users.status, 'active'),
          inArray(donors.bloodGroup, query.compatibleBloodGroups),
          withinExpr
        )
      )
      .orderBy(distanceExpr);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map((r) => ({
      donorId: r.donorId,
      bloodGroup: r.bloodGroup as BloodGroup,
      dateOfBirth: r.dateOfBirth,
      weightKg: r.weightKg,
      sex: r.sex as 'male' | 'female' | 'other',
      isAvailable: r.isAvailable,
      availableFrom: r.availableFrom,
      eligibleAfter: r.eligibleAfter,
      lastDonationDate: r.lastDonationDate,
      distanceMeters: r.distanceMeters,
      lastRespondedAt: r.lastRespondedAt
    }));
  }

  public async findRequestById(requestId: string): Promise<BloodRequestLookup | null> {
    const [row] = await this.db
      .select({
        id: bloodRequests.id,
        hospitalId: bloodRequests.hospitalId,
        bloodGroup: bloodRequests.bloodGroup,
        component: bloodRequests.component,
        unitsRequired: bloodRequests.unitsRequired,
        urgency: bloodRequests.urgency,
        status: bloodRequests.status,
        neededBy: bloodRequests.neededBy,
        location: bloodRequests.location
      })
      .from(bloodRequests)
      .where(eq(bloodRequests.id, requestId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      hospitalId: row.hospitalId,
      bloodGroup: row.bloodGroup as BloodGroup,
      component: row.component,
      unitsRequired: row.unitsRequired,
      urgency: row.urgency,
      status: row.status,
      neededBy: row.neededBy,
      location: row.location as GeoPoint
    };
  }

  /**
   * Persists match_runs and match_candidates atomically in a single transaction.
   * If the blood request is currently 'open', transitions it to 'matching'.
   */
  public async persistMatchRun(
    runData: PersistMatchRunInput,
    candidates: PersistCandidateInput[]
  ): Promise<{ run: MatchRunRecord; candidateCount: number }> {
    const executor =
      typeof this.db.transaction === 'function'
        ? this.db.transaction.bind(this.db)
        : async <T>(fn: (tx: DatabaseInstance) => Promise<T>): Promise<T> => fn(this.db);

    return executor(async (tx) => {
      // 1. Insert match_runs
      const [run] = await tx
        .insert(matchRuns)
        .values({
          requestId: runData.requestId,
          algorithm: runData.algorithm,
          algorithmVersion: runData.algorithmVersion,
          config: runData.config,
          modelVersion: runData.modelVersion ?? null,
          degraded: runData.degraded ?? false
        })
        .returning();

      if (!run) {
        throw new Error('Failed to insert match_run record');
      }

      // 2. Insert match_candidates if candidates exist
      if (candidates.length > 0) {
        await tx.insert(matchCandidates).values(
          candidates.map((c) => ({
            runId: run.id,
            donorId: c.donorId,
            rank: c.rank,
            score: c.score,
            pResponse: c.pResponse ?? null,
            distanceM: c.distanceMeters,
            travelSeconds: c.travelSeconds ?? null,
            batchNo: c.batchNo ?? 1,
            response: 'pending' as const
          }))
        );
      }

      // 3. Transition request status to 'matching' if open
      await tx
        .update(bloodRequests)
        .set({
          status: 'matching',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(bloodRequests.id, runData.requestId),
            eq(bloodRequests.status, 'open')
          )
        );

      return {
        run: {
          id: run.id,
          requestId: run.requestId,
          algorithm: run.algorithm as 'baseline' | 'hybrid',
          algorithmVersion: run.algorithmVersion,
          config: run.config as Record<string, unknown>,
          modelVersion: run.modelVersion,
          degraded: run.degraded,
          createdAt: run.createdAt
        },
        candidateCount: candidates.length
      };
    });
  }

  public async findLatestRunByRequestId(requestId: string): Promise<MatchRunRecord | null> {
    const [row] = await this.db
      .select({
        id: matchRuns.id,
        requestId: matchRuns.requestId,
        algorithm: matchRuns.algorithm,
        algorithmVersion: matchRuns.algorithmVersion,
        config: matchRuns.config,
        modelVersion: matchRuns.modelVersion,
        degraded: matchRuns.degraded,
        createdAt: matchRuns.createdAt
      })
      .from(matchRuns)
      .where(eq(matchRuns.requestId, requestId))
      .orderBy(desc(matchRuns.createdAt))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      requestId: row.requestId,
      algorithm: row.algorithm as 'baseline' | 'hybrid',
      algorithmVersion: row.algorithmVersion,
      config: row.config as Record<string, unknown>,
      modelVersion: row.modelVersion,
      degraded: row.degraded,
      createdAt: row.createdAt
    };
  }

  public async findCandidatesByRunId(runId: string): Promise<MatchCandidateRecord[]> {
    const rows = await this.db
      .select({
        id: matchCandidates.id,
        runId: matchCandidates.runId,
        donorId: matchCandidates.donorId,
        rank: matchCandidates.rank,
        score: matchCandidates.score,
        pResponse: matchCandidates.pResponse,
        distanceM: matchCandidates.distanceM,
        travelSeconds: matchCandidates.travelSeconds,
        batchNo: matchCandidates.batchNo,
        notifiedAt: matchCandidates.notifiedAt,
        response: matchCandidates.response,
        respondedAt: matchCandidates.respondedAt,
        createdAt: matchCandidates.createdAt,
        bloodGroup: donors.bloodGroup
      })
      .from(matchCandidates)
      .innerJoin(donors, eq(matchCandidates.donorId, donors.userId))
      .where(eq(matchCandidates.runId, runId))
      .orderBy(matchCandidates.rank);

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map((r) => ({
      id: r.id,
      runId: r.runId,
      donorId: r.donorId,
      rank: r.rank,
      score: r.score,
      pResponse: r.pResponse,
      distanceM: r.distanceM,
      travelSeconds: r.travelSeconds,
      batchNo: r.batchNo,
      notifiedAt: r.notifiedAt,
      response: r.response as 'pending' | 'accepted' | 'declined' | 'no_response',
      respondedAt: r.respondedAt,
      createdAt: r.createdAt,
      bloodGroup: r.bloodGroup as BloodGroup
    }));
  }
}
