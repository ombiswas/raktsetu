/**
 * End-to-End Acceptance Test for Phase 8
 * Scenario:
 * 1. Stub ML server running on ephemeral port
 * 2. Create emergency request -> batches notify Top-K candidates -> donor accepts -> request status fulfilled
 * 3. Kill the stub ML server -> second request matching run still completes in degraded mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDrizzle, type DatabaseInstance } from '../../src/platform/database/connection.js';
import { runMigrations } from '../../src/platform/database/migrate.js';
import {
  users,
  hospitals,
  donors,
  bloodRequests
} from '../../src/platform/database/schema.js';
import { eq } from 'drizzle-orm';
import { SpatialCandidateRepository } from '../../src/modules/matching/infrastructure/spatial-candidate.repository.js';
import { HttpMlClient } from '../../src/modules/matching/infrastructure/ml-client.js';
import { HybridRanker } from '../../src/modules/matching/domain/hybrid-ranker.js';
import { CreateMatchRunUseCase } from '../../src/modules/matching/application/create-match-run.usecase.js';
import { MatchingService } from '../../src/modules/matching/matching.service.js';
import { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import { NotificationsRepository } from '../../src/modules/notifications/notifications.repository.js';
import { ConsoleMailer } from '../../src/modules/notifications/infrastructure/mailer.js';
import { DefaultWebPushClient } from '../../src/modules/notifications/infrastructure/web-push-client.js';

const { Pool } = pg;

describe('Phase 8 End-to-End Acceptance: ML Matching, Top-K Expansion & Degraded Fallback', () => {
  let container: StartedPostgreSqlContainer | null = null;
  let pool: pg.Pool | null = null;
  let db: DatabaseInstance | null = null;
  let isDbConnected = false;

  let stubServer: http.Server | null = null;
  let stubServerUrl = '';
  let stubCallCount = 0;

  const hospitalUserId = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const donor1UserId = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const donor2UserId = '33333333-cccc-cccc-cccc-cccccccccccc';

  beforeAll(async () => {
    // 1. Start Stub ML Server on ephemeral port
    stubServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/predict/response') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          stubCallCount++;
          const parsed = JSON.parse(body);
          const predictions = (parsed.candidates || []).map((c: { donor_id: string }) => ({
            donor_id: c.donor_id,
            probability: 0.88,
            model_version: 'v1.0.0-xgb-stub',
            is_simulation: true
          }));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              request_id: parsed.request_id,
              predictions,
              model_version: 'v1.0.0-xgb-stub',
              timestamp: new Date().toISOString()
            })
          );
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      stubServer!.listen(0, '127.0.0.1', () => {
        const addr = stubServer!.address() as AddressInfo;
        stubServerUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 2. Connect Database (Testcontainers or fallback)
    let connectionString = process.env.TEST_DATABASE_URL || '';
    if (!connectionString) {
      try {
        container = await new PostgreSqlContainer('postgis/postgis:16-3.4')
          .withDatabase('raktsetu_acceptance_test')
          .withUsername('test_user')
          .withPassword('test_pass')
          .start();
        connectionString = container.getConnectionUri();
      } catch {
        connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/raktsetu';
      }
    }

    try {
      pool = new Pool({ connectionString, max: 5, statement_timeout: 10000 });
      await pool.query('SELECT 1');
      isDbConnected = true;
    } catch {
      isDbConnected = false;
      return;
    }

    db = createDrizzle(pool);
    await runMigrations(db);

    // 3. Seed Base Hospital and Donors in PostGIS
    await db.insert(users).values([
      { id: hospitalUserId, email: 'apollo.sarita@test.com', role: 'hospital', status: 'active', passwordHash: 'hash' },
      { id: donor1UserId, email: 'aarav.donor1@test.com', role: 'donor', status: 'active', passwordHash: 'hash' },
      { id: donor2UserId, email: 'rohan.donor2@test.com', role: 'donor', status: 'active', passwordHash: 'hash' }
    ]).onConflictDoNothing();

    await db.insert(hospitals).values({
      userId: hospitalUserId,
      name: 'Apollo Hospital Sarita Vihar',
      registrationNo: 'REG-APOLLO-101',
      phone: '+911122334455',
      address: 'Sarita Vihar, Delhi',
      location: { latitude: 28.5355, longitude: 77.291 }
    }).onConflictDoNothing();

    await db.insert(donors).values([
      {
        userId: donor1UserId,
        fullName: 'Aarav Sharma',
        phone: '+919876543210',
        bloodGroup: 'O+',
        dateOfBirth: '1995-05-15',
        weightKg: 72,
        sex: 'male',
        isAvailable: true,
        location: { latitude: 28.5441, longitude: 77.2971 } // ~1.1 km from hospital
      },
      {
        userId: donor2UserId,
        fullName: 'Rohan Gupta',
        phone: '+919876543211',
        bloodGroup: 'O+',
        dateOfBirth: '1993-08-20',
        weightKg: 68,
        sex: 'male',
        isAvailable: true,
        location: { latitude: 28.555, longitude: 77.28 } // ~2.5 km from hospital
      }
    ]).onConflictDoNothing();
  });

  afterAll(async () => {
    if (stubServer) {
      await new Promise<void>((resolve) => stubServer!.close(() => resolve()));
    }
    if (pool) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
  });

  it('runs complete loop: ML matching -> batch notify -> donor accept fulfils request -> kill stub -> degraded mode succeeds', async () => {
    if (!isDbConnected || !db) {
      console.warn('PostGIS database not reachable; skipping live end-to-end database assertions.');
      return;
    }

    const candidateRepo = new SpatialCandidateRepository(db);
    const notificationsRepo = new NotificationsRepository(db);
    const notificationsService = new NotificationsService(
      notificationsRepo,
      new ConsoleMailer(),
      new DefaultWebPushClient()
    );
    const matchingService = new MatchingService(candidateRepo);

    // --- STEP 1: Create Emergency Blood Request for 1 Unit ---
    const [request1] = await db.insert(bloodRequests).values({
      hospitalId: hospitalUserId,
      bloodGroup: 'O+',
      component: 'whole_blood',
      unitsRequired: 1,
      urgency: 'critical',
      status: 'matching',
      neededBy: new Date(Date.now() + 86400000),
      location: { latitude: 28.5355, longitude: 77.291 }
    }).returning();
    expect(request1).toBeDefined();

    // --- STEP 2: Trigger Match Run with Healthy ML Stub ---
    const mlClient = new HttpMlClient({
      baseUrl: stubServerUrl,
      token: 'test-token',
      timeoutMs: 800
    });

    const hybridRanker = new HybridRanker();
    const useCase = new CreateMatchRunUseCase(
      candidateRepo,
      hybridRanker,
      undefined,
      {
        initialRadiusMeters: 5000,
        radiusStepMeters: 5000,
        maxRadiusMeters: 25000,
        minCandidates: 1
      },
      {
        responsePredictor: mlClient,
        notificationsService,
        batchSize: 2
      }
    );

    const runResult = await useCase.execute({ requestId: request1.id });
    expect(runResult.candidateCount).toBeGreaterThanOrEqual(1);
    expect(stubCallCount).toBeGreaterThan(0);

    // Check Match Run Record
    const runRecord = await candidateRepo.findLatestRunByRequestId(request1.id);
    expect(runRecord).toBeDefined();
    expect(runRecord?.algorithm).toBe('hybrid');
    expect(runRecord?.degraded).toBe(false);
    expect(runRecord?.modelVersion).toBe('v1.0.0-xgb-stub');

    // Check Candidate Record in Batch 1
    const candList = await candidateRepo.findCandidatesByRunId(runRecord!.id);
    expect(candList.length).toBeGreaterThanOrEqual(1);
    const batch1Candidate = candList[0];
    expect(batch1Candidate.batchNo).toBe(1);
    expect(batch1Candidate.notifiedAt).not.toBeNull();
    expect(batch1Candidate.pResponse).toBe(0.88);
    expect(batch1Candidate.score).toBeGreaterThan(0);

    // --- STEP 3: Donor Accepts Request -> Fulfills Request ---
    const respondResult = await matchingService.respondToRequest(
      request1.id,
      batch1Candidate.donorId,
      'accept'
    );
    expect(respondResult.success).toBe(true);
    expect(respondResult.response).toBe('accepted');
    expect(respondResult.isFulfilled).toBe(true);

    // Verify Blood Request Status transitioned to 'fulfilled'
    const [updatedReq] = await db
      .select()
      .from(bloodRequests)
      .where(eq(bloodRequests.id, request1.id));
    expect(updatedReq.status).toBe('fulfilled');

    // Verify Consent Reveal: Hospital owner can see donor's firstName and phone
    const hospitalStatus = await matchingService.getMatchingStatus(request1.id, {
      id: hospitalUserId,
      role: 'hospital'
    });
    const acceptedView = hospitalStatus.candidates.find((c) => c.id === batch1Candidate.id);
    expect(acceptedView?.firstName).toBe('Aarav');
    expect(acceptedView?.phone).toBe('+919876543210');

    // --- STEP 4: KILL THE STUB ML SERVER ---
    await new Promise<void>((resolve) => stubServer!.close(() => resolve()));
    stubServer = null;

    // --- STEP 5: Create Second Request & Run Matching with Stub Dead ---
    const [request2] = await db.insert(bloodRequests).values({
      hospitalId: hospitalUserId,
      bloodGroup: 'O+',
      component: 'whole_blood',
      unitsRequired: 1,
      urgency: 'critical',
      status: 'matching',
      neededBy: new Date(Date.now() + 86400000),
      location: { latitude: 28.5355, longitude: 77.291 }
    }).returning();
    expect(request2).toBeDefined();

    // Use same client pointing to closed port
    const degradedRunResult = await useCase.execute({ requestId: request2.id });
    expect(degradedRunResult.candidateCount).toBeGreaterThanOrEqual(1);

    // Verify Match Run Completed in Degraded Mode
    const runRecord2 = await candidateRepo.findLatestRunByRequestId(request2.id);
    expect(runRecord2).toBeDefined();
    expect(runRecord2?.degraded).toBe(true);
    // Algorithm strategy remains configured ('hybrid'), but degraded is true
    expect(runRecord2?.algorithm).toBe('hybrid');
  });
});
