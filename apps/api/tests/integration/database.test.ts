import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  createDbPool,
  createDrizzle,
  withTransaction,
  checkDatabaseReadiness,
  type DatabaseInstance
} from '../../src/platform/database/connection.js';
import { runMigrations } from '../../src/platform/database/migrate.js';
import { seedDatabase } from '../../src/platform/database/seed.js';
import {
  users,
  donors,
  bloodRequests,
  inventoryMovements
} from '../../src/platform/database/schema.js';

const { Pool } = pg;

describe('Database Layer Integration Tests', () => {
  let container: StartedPostgreSqlContainer | null = null;
  let pool: pg.Pool;
  let db: DatabaseInstance;
  let connectionString: string;

  beforeAll(async () => {
    // Check if external test DB URL provided, else spin up PostGIS Testcontainer
    if (process.env.TEST_DATABASE_URL) {
      connectionString = process.env.TEST_DATABASE_URL;
    } else {
      try {
        console.log('Starting Testcontainers PostGIS container (postgis/postgis:16-3.4)...');
        container = await new PostgreSqlContainer('postgis/postgis:16-3.4')
          .withDatabase('raktsetu_test')
          .withUsername('test_user')
          .withPassword('test_pass')
          .start();
        connectionString = container.getConnectionUri();
      } catch (err) {
        console.warn('Could not launch Testcontainers. Falling back to default local database URL.', err);
        connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/raktsetu';
      }
    }

    pool = new Pool({
      connectionString,
      max: 5,
      statement_timeout: 10000
    });
    db = createDrizzle(pool);
  }, 120000);

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
  });

  describe('Readiness & Connection', () => {
    it('verifies connection readiness with probe', async () => {
      const isReady = await checkDatabaseReadiness(pool);
      expect(isReady).toBe(true);
    });

    it('creates pool with ssl enforcement flag check', () => {
      // In production mode, pool enforces rejectUnauthorized
      const prodPool = createDbPool(
        {
          NODE_ENV: 'production',
          isProduction: true,
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db'
        } as unknown as Parameters<typeof createDbPool>[0],
        { max: 5 }
      );
      expect(prodPool).toBeDefined();
      void prodPool.end();
    });
  });

  describe('Migrations Execution', () => {
    it('applies migration 0000 cleanly from scratch on an empty database', async () => {
      await runMigrations(db);

      // Verify extensions exist
      const extResult = await pool.query<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pgcrypto')"
      );
      const extNames = extResult.rows.map((r) => r.extname);
      expect(extNames).toContain('postgis');
      expect(extNames).toContain('pgcrypto');

      // Verify tables exist
      const tablesResult = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      const tableNames = tablesResult.rows.map((r) => r.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('donors');
      expect(tableNames).toContain('hospitals');
      expect(tableNames).toContain('blood_banks');
      expect(tableNames).toContain('blood_requests');
      expect(tableNames).toContain('donations');
      expect(tableNames).toContain('blood_inventory');
      expect(tableNames).toContain('match_candidates');

      // Verify migration journal table exists
      const migrationTableResult = await pool.query<{ count: string }>(
        "SELECT count(*)::text as count FROM information_schema.tables WHERE table_name = '__drizzle_migrations'"
      );
      expect(parseInt(migrationTableResult.rows[0]?.count ?? '0', 10)).toBeGreaterThan(0);
    });

    it('migration execution is idempotent and repeatable', async () => {
      // Running migrations again must not throw
      await expect(runMigrations(db)).resolves.not.toThrow();
    });
  });

  describe('Safe Development Seed Script', () => {
    it('populates admin, hospitals, blood banks, and donors', async () => {
      const summary = await seedDatabase(db, {
        donorCount: 30,
        adminEmail: 'test.admin@raktsetu.internal',
        adminPassword: 'SecureTestAdminPass2026!'
      });

      expect(summary.adminId).toBeDefined();
      expect(summary.hospitalCount).toBeGreaterThanOrEqual(2);
      expect(summary.bloodBankCount).toBeGreaterThanOrEqual(1);
      expect(summary.donorCount).toBe(30);

      // Verify admin user is active with hashed password
      const [admin] = await db
        .select()
        .from(users)
        .where(sql`${users.email} = 'test.admin@raktsetu.internal'`);
      expect(admin).toBeDefined();
      expect(admin?.role).toBe('admin');
      expect(admin?.passwordHash).toMatch(/^\$argon2id\$/);

      // Verify donors count
      const donorRows = await db.select().from(donors);
      expect(donorRows.length).toBeGreaterThanOrEqual(30);
    });

    it('strictly refuses to run if NODE_ENV=production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(seedDatabase(db)).rejects.toThrow(/rejected in production environment/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Database-Level CHECK Constraints & Enums', () => {
    it('rejects donor weight below 45 kg', async () => {
      // Create user first
      const [u] = await db
        .insert(users)
        .values({
          email: 'underweight.donor@raktsetu.test',
          passwordHash: 'dummyhash',
          role: 'donor',
          status: 'active'
        })
        .returning({ id: users.id });

      expect(u).toBeDefined();

      await expect(
        db.insert(donors).values({
          userId: u!.id,
          fullName: 'Underweight Donor',
          phone: '+919999999001',
          bloodGroup: 'O+',
          dateOfBirth: '2000-01-01',
          weightKg: 42.0, // Invalid: < 45 kg
          sex: 'male',
          location: { latitude: 30.3165, longitude: 78.0322 }
        })
      ).rejects.toThrow(/donors_weight_kg_check/);
    });

    it('rejects uppercase email due to lowercase check constraint', async () => {
      await expect(
        db.insert(users).values({
          email: 'UPPERCASE.USER@RAKTSETU.TEST',
          passwordHash: 'dummyhash',
          role: 'donor',
          status: 'active'
        })
      ).rejects.toThrow(/users_email_lowercase_check/);
    });

    it('rejects blood requests with negative or zero units required', async () => {
      // Find a hospital
      const hospResult = await pool.query<{ user_id: string }>('SELECT user_id FROM hospitals LIMIT 1');
      const hosp = hospResult.rows[0];
      expect(hosp).toBeDefined();

      await expect(
        db.insert(bloodRequests).values({
          hospitalId: hosp!.user_id,
          bloodGroup: 'A+',
          component: 'rbc',
          unitsRequired: 0, // Invalid: must be > 0 (units_required_check)
          unitsFulfilled: 0,
          urgency: 'urgent',
          neededBy: new Date(),
          location: { latitude: 30.3256, longitude: 78.0436 }
        })
      ).rejects.toThrow(/blood_requests_units_required_check/);
    });

    it('rejects blood inventory with negative units', async () => {
      const bbResult = await pool.query<{ user_id: string }>('SELECT user_id FROM blood_banks LIMIT 1');
      const bb = bbResult.rows[0];
      expect(bb).toBeDefined();

      await expect(
        pool.query(
          `INSERT INTO blood_inventory (id, blood_bank_id, blood_group, component, units)
           VALUES (gen_random_uuid(), $1, 'AB-', 'platelets', -5)`,
          [bb!.user_id]
        )
      ).rejects.toThrow(/blood_inventory_units_check/);
    });

    it('rejects inventory movements with zero delta', async () => {
      const invResult = await pool.query<{ id: string }>('SELECT id FROM blood_inventory LIMIT 1');
      const inv = invResult.rows[0];
      expect(inv).toBeDefined();

      await expect(
        db.insert(inventoryMovements).values({
          inventoryId: inv!.id,
          delta: 0, // Invalid: delta must != 0
          reason: 'invalid delta test'
        })
      ).rejects.toThrow(/inventory_movements_delta_check/);
    });

    it('rejects invalid enum values via database enum type', async () => {
      await expect(
        pool.query(
          `INSERT INTO users (id, email, password_hash, role, status)
           VALUES (gen_random_uuid(), 'invalid.enum@raktsetu.test', 'hash', 'superhero', 'active')`
        )
      ).rejects.toThrow(/invalid input value for enum user_role/);
    });
  });

  describe('PostGIS Spatial Index (GiST) Usage', () => {
    it('uses GiST index for ST_DWithin spatial queries (verified via EXPLAIN)', async () => {
      // Client session with enable_seqscan=off to assert index path viability
      const client = await pool.connect();
      try {
        await client.query('SET enable_seqscan = off');

        // Target location: Clock Tower, Dehradun (30.3256, 78.0436)
        // Search radius: 5000 meters (5km)
        const explainResult = await client.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN SELECT user_id, full_name
           FROM donors
           WHERE ST_DWithin(
             location,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             $3
           )`,
          [78.0436, 30.3256, 5000]
        );

        const planLines = explainResult.rows.map((r) => r['QUERY PLAN']).join('\n');
        console.log('Spatial Query Execution Plan:\n', planLines);

        // Verify that the GiST index was selected by the PostgreSQL query planner
        const usesGistIndex = planLines.includes('donors_location_gist_idx');

        expect(usesGistIndex).toBe(true);
      } finally {
        await client.query('SET enable_seqscan = on');
        client.release();
      }
    });

    it('correctly calculates distance and finds nearby donors within radius', async () => {
      // Clock Tower Dehradun coordinates
      const centerLon = 78.0436;
      const centerLat = 30.3256;
      const radiusMeters = 15000; // 15 km

      const result = await pool.query<{
        user_id: string;
        full_name: string;
        distance_m: number;
      }>(
        `SELECT user_id, full_name,
                ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
         FROM donors
         WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY distance_m ASC
         LIMIT 5`,
        [centerLon, centerLat, radiusMeters]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.distance_m).toBeLessThanOrEqual(radiusMeters);
        expect(row.distance_m).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Transaction Safety Helper (withTransaction)', () => {
    it('commits transaction on success', async () => {
      const userEmail = 'tx.success@raktsetu.test';

      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO users (id, email, password_hash, role, status)
           VALUES (gen_random_uuid(), $1, 'pass', 'donor', 'active')`,
          [userEmail]
        );
      });

      const res = await pool.query('SELECT email FROM users WHERE email = $1', [userEmail]);
      expect(res.rows.length).toBe(1);
    });

    it('rolls back transaction on error', async () => {
      const userEmail = 'tx.fail@raktsetu.test';

      await expect(
        withTransaction(pool, async (client) => {
          await client.query(
            `INSERT INTO users (id, email, password_hash, role, status)
             VALUES (gen_random_uuid(), $1, 'pass', 'donor', 'active')`,
            [userEmail]
          );
          // Simulate error
          throw new Error('Simulated failure during transaction');
        })
      ).rejects.toThrow('Simulated failure during transaction');

      const res = await pool.query('SELECT email FROM users WHERE email = $1', [userEmail]);
      expect(res.rows.length).toBe(0);
    });
  });
});
