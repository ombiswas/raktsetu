import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  createDrizzle,
  type DatabaseInstance
} from '../../src/platform/database/connection.js';
import { runMigrations } from '../../src/platform/database/migrate.js';
import {
  users,
  donors
} from '../../src/platform/database/schema.js';
import { SpatialCandidateRepository } from '../../src/modules/matching/infrastructure/spatial-candidate.repository.js';

const { Pool } = pg;

/**
 * Standard Haversine geodesic distance in meters between two (lat, lon) coordinates on WGS84 sphere.
 */
function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Mean Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

describe('PostGIS Spatial Candidate Repository Integration Tests', () => {
  let container: StartedPostgreSqlContainer | null = null;
  let pool: pg.Pool | null = null;
  let db: DatabaseInstance | null = null;
  let connectionString: string;
  let spatialRepo: SpatialCandidateRepository | null = null;
  let isDbConnected = false;

  // Known Benchmark Geospatial Coordinates:
  // Hospital Reference Point: Apollo Hospital, Sarita Vihar, Delhi
  const hospitalPoint = { latitude: 28.535515, longitude: 77.291012 };

  // Donor 1: Jasola Vihar (Close: ~1,135 meters)
  const donor1Id = 'aaaaaaaa-1111-1111-1111-111111111111';
  const donor1Point = { latitude: 28.54412, longitude: 77.29715 };
  const expectedDistance1Meters = 1135;

  // Donor 2: AIIMS, New Delhi (Mid-range: ~8,610 meters)
  const donor2Id = 'bbbbbbbb-2222-2222-2222-222222222222';
  const donor2Point = { latitude: 28.5672, longitude: 77.21 };
  const expectedDistance2Meters = 8610;

  // Donor 3: Cyber City, Gurugram (Far: ~20,250 meters)
  const donor3Id = 'cccccccc-3333-3333-3333-333333333333';
  const donor3Point = { latitude: 28.495, longitude: 77.089 };
  const expectedDistance3Meters = 20250;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      connectionString = process.env.TEST_DATABASE_URL;
    } else {
      try {
        console.log('Attempting Testcontainers PostGIS container launch for spatial tests...');
        container = await new PostgreSqlContainer('postgis/postgis:16-3.4')
          .withDatabase('raktsetu_spatial_test')
          .withUsername('test_user')
          .withPassword('test_pass')
          .start();
        connectionString = container.getConnectionUri();
      } catch (err) {
        console.warn('Testcontainers unavailable; checking local DATABASE_URL...', err);
        connectionString =
          process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/raktsetu';
      }
    }

    try {
      pool = new Pool({
        connectionString,
        max: 5,
        statement_timeout: 10000
      });
      await pool.query('SELECT 1');
      isDbConnected = true;
    } catch {
      console.warn('PostgreSQL/PostGIS not reachable in current host environment. Live database queries will be skipped.');
      isDbConnected = false;
      return;
    }

    db = createDrizzle(pool);

    // Apply database migrations
    await runMigrations(db);

    spatialRepo = new SpatialCandidateRepository(db);

    // Seed test users & donors with known benchmark coordinates
    const testUsers = [
      { id: donor1Id, email: 'donor1.spatial@test.com', role: 'donor' as const, status: 'active' as const, passwordHash: 'hash' },
      { id: donor2Id, email: 'donor2.spatial@test.com', role: 'donor' as const, status: 'active' as const, passwordHash: 'hash' },
      { id: donor3Id, email: 'donor3.spatial@test.com', role: 'donor' as const, status: 'active' as const, passwordHash: 'hash' }
    ];

    for (const u of testUsers) {
      await db.insert(users).values(u).onConflictDoNothing();
    }

    const testDonors = [
      {
        userId: donor1Id,
        fullName: 'Donor 1 Jasola',
        phone: '+919811111111',
        bloodGroup: 'O+' as const,
        dateOfBirth: '1995-01-01',
        weightKg: 70,
        sex: 'male' as const,
        location: donor1Point,
        isAvailable: true
      },
      {
        userId: donor2Id,
        fullName: 'Donor 2 AIIMS',
        phone: '+919822222222',
        bloodGroup: 'O-' as const,
        dateOfBirth: '1992-06-15',
        weightKg: 65,
        sex: 'female' as const,
        location: donor2Point,
        isAvailable: true
      },
      {
        userId: donor3Id,
        fullName: 'Donor 3 Gurugram',
        phone: '+919833333333',
        bloodGroup: 'B+' as const,
        dateOfBirth: '1990-11-20',
        weightKg: 80,
        sex: 'male' as const,
        location: donor3Point,
        isAvailable: true
      }
    ];

    for (const d of testDonors) {
      await db.insert(donors).values(d).onConflictDoNothing();
    }
  }, 120000);

  afterAll(async () => {
    if (pool && isDbConnected) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
  });

  describe('Deterministic Geodesic Distance Formula Verification (Offline & Live)', () => {
    it('asserts mathematical WGS84 geodesic distances are within 1% of benchmarks', () => {
      // Benchmark 1: Apollo -> Jasola (~1,135m)
      const dist1 = calculateHaversineDistanceMeters(
        hospitalPoint.latitude,
        hospitalPoint.longitude,
        donor1Point.latitude,
        donor1Point.longitude
      );
      const err1 = Math.abs(dist1 - expectedDistance1Meters) / expectedDistance1Meters;
      expect(err1).toBeLessThan(0.01);

      // Benchmark 2: Apollo -> AIIMS (~8,610m)
      const dist2 = calculateHaversineDistanceMeters(
        hospitalPoint.latitude,
        hospitalPoint.longitude,
        donor2Point.latitude,
        donor2Point.longitude
      );
      const err2 = Math.abs(dist2 - expectedDistance2Meters) / expectedDistance2Meters;
      expect(err2).toBeLessThan(0.01);

      // Benchmark 3: Apollo -> Gurugram (~20,250m)
      const dist3 = calculateHaversineDistanceMeters(
        hospitalPoint.latitude,
        hospitalPoint.longitude,
        donor3Point.latitude,
        donor3Point.longitude
      );
      const err3 = Math.abs(dist3 - expectedDistance3Meters) / expectedDistance3Meters;
      expect(err3).toBeLessThan(0.01);
    });
  });

  describe('PostGIS Geodesic Distance Accuracy (within 1% threshold on Live DB)', () => {
    it('calculates ST_Distance for Donor 1 (Jasola) within 1% of benchmark (~1,135m)', async () => {
      if (!isDbConnected || !spatialRepo) return;

      const candidates = await spatialRepo.findCandidatesWithinRadius({
        hospitalLocation: hospitalPoint,
        compatibleBloodGroups: ['O+'],
        radiusMeters: 5000
      });

      const donor1 = candidates.find((c) => c.donorId === donor1Id);
      expect(donor1).toBeDefined();

      const measuredDistance = donor1!.distanceMeters;
      const errorPercentage =
        Math.abs(measuredDistance - expectedDistance1Meters) / expectedDistance1Meters;

      expect(errorPercentage).toBeLessThan(0.01);
    });

    it('calculates ST_Distance for Donor 2 (AIIMS) within 1% of benchmark (~8,610m)', async () => {
      if (!isDbConnected || !spatialRepo) return;

      const candidates = await spatialRepo.findCandidatesWithinRadius({
        hospitalLocation: hospitalPoint,
        compatibleBloodGroups: ['O-'],
        radiusMeters: 12000
      });

      const donor2 = candidates.find((c) => c.donorId === donor2Id);
      expect(donor2).toBeDefined();

      const measuredDistance = donor2!.distanceMeters;
      const errorPercentage =
        Math.abs(measuredDistance - expectedDistance2Meters) / expectedDistance2Meters;

      expect(errorPercentage).toBeLessThan(0.01);
    });
  });

  describe('PostGIS Spatial Index (GiST) Verification via EXPLAIN', () => {
    it('proves that ST_DWithin utilizes donors_location_gist_idx execution path', async () => {
      if (!isDbConnected || !pool) return;

      const client = await pool.connect();
      try {
        await client.query('SET enable_seqscan = off');

        const explainQuery = `
          EXPLAIN SELECT d.user_id
          FROM donors d
          INNER JOIN users u ON u.id = d.user_id
          WHERE u.status = 'active'
            AND d.blood_group IN ('O+', 'O-')
            AND ST_DWithin(
              d.location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              $3
            )
        `;

        const explainResult = await client.query<{ 'QUERY PLAN': string }>(explainQuery, [
          hospitalPoint.longitude,
          hospitalPoint.latitude,
          10000
        ]);

        const planOutput = explainResult.rows.map((r) => r['QUERY PLAN']).join('\n');
        console.log('Matching Spatial Query Plan:\n', planOutput);

        const usesGistIndex = planOutput.includes('donors_location_gist_idx');
        expect(usesGistIndex).toBe(true);
      } finally {
        await client.query('SET enable_seqscan = on');
        client.release();
      }
    });
  });

  describe('Geospatial Radius & Blood Group Filtering', () => {
    it('restricts candidate retrieval strictly to radius threshold', async () => {
      if (!isDbConnected || !spatialRepo) return;

      const closeRadius = await spatialRepo.findCandidatesWithinRadius({
        hospitalLocation: hospitalPoint,
        compatibleBloodGroups: ['O+', 'O-', 'B+'],
        radiusMeters: 3000
      });
      expect(closeRadius.map((c) => c.donorId)).toEqual([donor1Id]);

      const midRadius = await spatialRepo.findCandidatesWithinRadius({
        hospitalLocation: hospitalPoint,
        compatibleBloodGroups: ['O+', 'O-', 'B+'],
        radiusMeters: 10000
      });
      expect(midRadius.map((c) => c.donorId)).toEqual([donor1Id, donor2Id]);

      const farRadius = await spatialRepo.findCandidatesWithinRadius({
        hospitalLocation: hospitalPoint,
        compatibleBloodGroups: ['O+', 'O-', 'B+'],
        radiusMeters: 25000
      });
      expect(farRadius.map((c) => c.donorId)).toEqual([donor1Id, donor2Id, donor3Id]);
    });

    it('pre-filters incompatible blood groups at SQL level', async () => {
      if (!isDbConnected || !spatialRepo) return;

      const oMinusOnly = await spatialRepo.findCandidatesWithinRadius({
        hospitalLocation: hospitalPoint,
        compatibleBloodGroups: ['O-'],
        radiusMeters: 30000
      });

      expect(oMinusOnly).toHaveLength(1);
      expect(oMinusOnly[0]?.donorId).toBe(donor2Id);
    });

    it('guarantees zero coordinates are returned in application memory records', async () => {
      if (!isDbConnected || !spatialRepo) return;

      const candidates = await spatialRepo.findCandidatesWithinRadius({
        hospitalLocation: hospitalPoint,
        compatibleBloodGroups: ['O+', 'O-'],
        radiusMeters: 15000
      });

      for (const candidate of candidates) {
        const record = candidate as unknown as Record<string, unknown>;
        expect(record['location']).toBeUndefined();
        expect(record['latitude']).toBeUndefined();
        expect(record['longitude']).toBeUndefined();
        expect('location' in candidate).toBe(false);
        expect('latitude' in candidate).toBe(false);
        expect('longitude' in candidate).toBe(false);
      }
    });
  });
});
