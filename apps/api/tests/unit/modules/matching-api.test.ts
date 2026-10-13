import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { createConfig } from '../../../src/platform/config/index.js';
import { createAccessToken } from '../../../src/modules/auth/domain/tokens.js';
import type { DatabaseInstance } from '../../../src/platform/database/connection.js';

type MockRecord = Record<string, unknown>;

describe('Matching Module HTTP API Tests (/v1/requests/:id/matching)', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  const config = createConfig({
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-chars-long!',
    COOKIE_SECRET: 'test-cookie-secret-at-least-32-chars-long!',
    JWT_ISSUER: 'raktsetu-matching-test'
  });

  const ownerHospitalId = '11111111-1111-1111-1111-111111111111';
  const otherHospitalId = '22222222-2222-2222-2222-222222222222';
  const adminId = '33333333-3333-3333-3333-333333333333';
  const donorId = '44444444-4444-4444-4444-444444444444';

  const validRequestId = '55555555-5555-5555-5555-555555555555';
  const runId = '66666666-6666-6666-6666-666666666666';

  let ownerHospitalToken: string;
  let otherHospitalToken: string;
  let adminToken: string;
  let donorToken: string;

  const now = new Date();

  // In-memory data
  const usersStore = new Map<string, MockRecord>([
    [ownerHospitalId, { id: ownerHospitalId, email: 'apollo@hospital.com', role: 'hospital', status: 'active', createdAt: now }],
    [otherHospitalId, { id: otherHospitalId, email: 'max@hospital.com', role: 'hospital', status: 'active', createdAt: now }],
    [adminId, { id: adminId, email: 'admin@raktsetu.com', role: 'admin', status: 'active', createdAt: now }],
    [donorId, { id: donorId, email: 'donor@gmail.com', role: 'donor', status: 'active', createdAt: now }]
  ]);

  const requestsStore = new Map<string, MockRecord>([
    [
      validRequestId,
      {
        id: validRequestId,
        hospitalId: ownerHospitalId,
        bloodGroup: 'O+',
        component: 'whole_blood',
        unitsRequired: 2,
        urgency: 'critical',
        status: 'matching',
        neededBy: new Date(Date.now() + 86400000),
        location: { latitude: 28.5355, longitude: 77.291 }
      }
    ]
  ]);

  const matchRunsStore = new Map<string, MockRecord>([
    [
      runId,
      {
        id: runId,
        requestId: validRequestId,
        algorithm: 'baseline',
        algorithmVersion: 'v1.0.0-baseline',
        config: { initialRadiusMeters: 5000, finalRadiusMeters: 10000 },
        modelVersion: null,
        degraded: false,
        createdAt: now
      }
    ]
  ]);

  const matchCandidatesStore: MockRecord[] = [
    {
      id: '77777777-7777-7777-7777-777777777771',
      runId,
      donorId: '88888888-8888-8888-8888-888888888881',
      rank: 1,
      score: 0.95,
      pResponse: null,
      distanceM: 2450, // "2-3 km"
      travelSeconds: null,
      batchNo: 1,
      notifiedAt: null,
      response: 'pending',
      respondedAt: null,
      createdAt: now,
      bloodGroup: 'O+'
    },
    {
      id: '77777777-7777-7777-7777-777777777772',
      runId,
      donorId: '88888888-8888-8888-8888-888888888882',
      rank: 2,
      score: 0.88,
      pResponse: null,
      distanceM: 610, // "< 1 km"
      travelSeconds: null,
      batchNo: 1,
      notifiedAt: null,
      response: 'accepted',
      respondedAt: now,
      createdAt: now,
      bloodGroup: 'O-'
    }
  ];

  function getTableName(table: unknown): string {
    if (!table || typeof table !== 'object') return '';
    const drizzleName = (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')];
    if (typeof drizzleName === 'string') return drizzleName;
    const internal = (table as { _?: { name?: string } })._?.name;
    if (typeof internal === 'string') return internal;
    return '';
  }

  function extractId(condition: unknown): string | undefined {
    if (!condition || typeof condition !== 'object') return undefined;
    const condRecord = condition as { queryChunks?: unknown[] };
    if (condRecord.queryChunks && Array.isArray(condRecord.queryChunks)) {
      for (const chunk of condRecord.queryChunks) {
        if (typeof chunk === 'string') {
          const uuidMatch = chunk.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatch) return uuidMatch[0];
          const match = [
            ownerHospitalId,
            otherHospitalId,
            adminId,
            donorId,
            validRequestId,
            runId
          ].find((id) => chunk.includes(id));
          if (match) return match;
        }
        if (
          chunk &&
          typeof chunk === 'object' &&
          'value' in chunk &&
          typeof (chunk as { value: unknown }).value === 'string'
        ) {
          const val = (chunk as { value: string }).value;
          const uuidMatch = val.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatch) return uuidMatch[0];
          const match = [
            ownerHospitalId,
            otherHospitalId,
            adminId,
            donorId,
            validRequestId,
            runId
          ].find((id) => val.includes(id));
          if (match) return match;
        }
      }
    }
    return undefined;
  }

  const mockDb = {
    select(_fields?: unknown) {
      return {
        from(table: unknown) {
          const tableName = getTableName(table);
          return {
            innerJoin() {
              return this;
            },
            where(condition: unknown) {
              return {
                orderBy() {
                  return this;
                },
                limit(n: number) {
                  return this.execute().then((rows: MockRecord[]) => rows.slice(0, n));
                },
                then(resolve: (value: unknown) => void) {
                  return this.execute().then(resolve);
                },
                async execute(): Promise<MockRecord[]> {
                  const targetId = extractId(condition);

                  if (tableName === 'users') {
                    if (targetId && usersStore.has(targetId)) {
                      return [usersStore.get(targetId)!];
                    }
                    return [];
                  }

                  if (tableName === 'blood_requests') {
                    if (targetId && requestsStore.has(targetId)) {
                      return [requestsStore.get(targetId)!];
                    }
                    return [];
                  }

                  if (tableName === 'match_runs') {
                    if (targetId) {
                      for (const run of matchRunsStore.values()) {
                        if (run.requestId === targetId || run.id === targetId) {
                          return [run];
                        }
                      }
                    }
                    return [];
                  }

                  if (tableName === 'match_candidates') {
                    if (targetId) {
                      return matchCandidatesStore.filter((c) => c.runId === targetId);
                    }
                    return matchCandidatesStore;
                  }

                  return [];
                }
              };
            },
            orderBy() {
              return {
                limit(n: number) {
                  return this.execute().then((rows: MockRecord[]) => rows.slice(0, n));
                },
                then(resolve: (value: unknown) => void) {
                  return this.execute().then(resolve);
                },
                async execute(): Promise<MockRecord[]> {
                  if (tableName === 'match_runs') {
                    return Array.from(matchRunsStore.values());
                  }
                  if (tableName === 'match_candidates') {
                    return matchCandidatesStore;
                  }
                  return [];
                }
              };
            },
            then(resolve: (value: unknown) => void) {
              return this.execute().then(resolve);
            },
            async execute(): Promise<MockRecord[]> {
              if (tableName === 'users') return Array.from(usersStore.values());
              if (tableName === 'blood_requests') return Array.from(requestsStore.values());
              if (tableName === 'match_runs') return Array.from(matchRunsStore.values());
              if (tableName === 'match_candidates') return matchCandidatesStore;
              return [];
            }
          };
        }
      };
    },
    insert(_table: unknown) {
      return {
        values(v: unknown) {
          return {
            returning() {
              return Promise.resolve([v]);
            },
            then(resolve: (value: unknown) => void) {
              return resolve(v);
            }
          };
        }
      };
    },
    update() {
      return {
        set() {
          return {
            where() {
              return Promise.resolve([]);
            }
          };
        }
      };
    },
    transaction(fn: (tx: unknown) => Promise<unknown>) {
      return fn(this);
    }
  } as unknown as DatabaseInstance;

  beforeAll(async () => {
    app = await buildApp({
      config,
      db: mockDb,
      checkDatabase: async () => true
    });
    await app.ready();
    request = supertest(app.server);

    ownerHospitalToken = await createAccessToken(ownerHospitalId, 'hospital', config);
    otherHospitalToken = await createAccessToken(otherHospitalId, 'hospital', config);
    adminToken = await createAccessToken(adminId, 'admin', config);
    donorToken = await createAccessToken(donorId, 'donor', config);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authorization & IDOR Protection', () => {
    it('allows the hospital owner to fetch matching status', async () => {
      const res = await request
        .get(`/v1/requests/${validRequestId}/matching`)
        .set('Authorization', `Bearer ${ownerHospitalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.requestId).toBe(validRequestId);
      expect(res.body.runId).toBe(runId);
      expect(res.body.algorithm).toBe('baseline');
      expect(res.body.candidateCounts).toEqual({
        total: 2,
        pending: 1,
        accepted: 1,
        declined: 0,
        noResponse: 0
      });
      expect(res.body.candidates).toHaveLength(2);
    });

    it('allows an administrator to inspect matching details', async () => {
      const res = await request
        .get(`/v1/requests/${validRequestId}/matching`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.requestId).toBe(validRequestId);
    });

    it('rejects another hospital attempting to view matching details (IDOR safety) with 403', async () => {
      const res = await request
        .get(`/v1/requests/${validRequestId}/matching`)
        .set('Authorization', `Bearer ${otherHospitalToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a donor attempting to inspect matching candidates with 403', async () => {
      const res = await request
        .get(`/v1/requests/${validRequestId}/matching`)
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request.get(`/v1/requests/${validRequestId}/matching`);
      expect(res.status).toBe(401);
    });

    it('returns 404 when request ID does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request
        .get(`/v1/requests/${nonExistentId}/matching`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Privacy & PII Cloaking Guarantee', () => {
    it('guarantees response contains zero coordinates, names, or phone numbers', async () => {
      const res = await request
        .get(`/v1/requests/${validRequestId}/matching`)
        .set('Authorization', `Bearer ${ownerHospitalToken}`);

      expect(res.status).toBe(200);

      const bodyStr = JSON.stringify(res.body);

      // 1. No geospatial coordinates in JSON payload
      expect(bodyStr).not.toContain('latitude');
      expect(bodyStr).not.toContain('longitude');
      expect(bodyStr).not.toContain('28.5');
      expect(bodyStr).not.toContain('77.2');

      // 2. No donor personal identifiers
      expect(bodyStr).not.toContain('phone');
      expect(bodyStr).not.toContain('fullName');
      expect(bodyStr).not.toContain('email');

      // 3. Distance is quantized into privacy bands
      const candidates = res.body.candidates;
      expect(candidates[0].approximateDistance).toBe('2-3 km');
      expect(candidates[1].approximateDistance).toBe('< 1 km');

      // 4. Candidate IDs must not be the donor's user ID
      for (const candidate of candidates) {
        expect(candidate.id).not.toBe('88888888-8888-8888-8888-888888888881');
        expect(candidate.id).not.toBe('88888888-8888-8888-8888-888888888882');
      }
    });
  });
});
