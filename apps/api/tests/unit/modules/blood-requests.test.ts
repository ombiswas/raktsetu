import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { createConfig } from '../../../src/platform/config/index.js';
import { createAccessToken } from '../../../src/modules/auth/domain/tokens.js';
import type { DatabaseInstance } from '../../../src/platform/database/connection.js';

type MockRecord = Record<string, unknown>;

describe('Blood Requests Module End-to-End Tests (/v1/requests)', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  const config = createConfig({
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-chars-long!',
    COOKIE_SECRET: 'test-cookie-secret-at-least-32-chars-long!',
    JWT_ISSUER: 'raktsetu-requests-test'
  });

  // Principals
  const verifiedHospitalId = '11111111-2222-3333-4444-555555555555';
  const unverifiedHospitalId = '22222222-3333-4444-5555-666666666666';
  const otherHospitalId = '33333333-4444-5555-6666-777777777777';
  const bloodBankId = '44444444-5555-6666-7777-888888888888';
  const adminId = '55555555-6666-7777-8888-999999999999';
  const donorId = '66666666-7777-8888-9999-000000000000';

  let verifiedHospitalToken: string;
  let unverifiedHospitalToken: string;
  let otherHospitalToken: string;
  let bloodBankToken: string;
  let adminToken: string;
  let donorToken: string;

  // In-memory data stores
  const now = new Date();
  const usersStore = new Map<string, MockRecord>([
    [verifiedHospitalId, { id: verifiedHospitalId, email: 'apollo@hospital.com', role: 'hospital', status: 'active', createdAt: now }],
    [unverifiedHospitalId, { id: unverifiedHospitalId, email: 'pending@hospital.com', role: 'hospital', status: 'active', createdAt: now }],
    [otherHospitalId, { id: otherHospitalId, email: 'max@hospital.com', role: 'hospital', status: 'active', createdAt: now }],
    [bloodBankId, { id: bloodBankId, email: 'redcross@bloodbank.com', role: 'blood_bank', status: 'active', createdAt: now }],
    [adminId, { id: adminId, email: 'admin@raktsetu.com', role: 'admin', status: 'active', createdAt: now }],
    [donorId, { id: donorId, email: 'donor@example.com', role: 'donor', status: 'active', createdAt: now }]
  ]);

  const hospitalsStore = new Map<string, MockRecord>([
    [
      verifiedHospitalId,
      {
        userId: verifiedHospitalId,
        name: 'Apollo Hospital',
        registrationNo: 'REG-HOSP-1',
        phone: '+911122334455',
        address: 'Sarita Vihar, Delhi',
        location: { latitude: 28.5355, longitude: 77.291 },
        verifiedAt: new Date(),
        verifiedBy: adminId
      }
    ],
    [
      unverifiedHospitalId,
      {
        userId: unverifiedHospitalId,
        name: 'Pending Hospital',
        registrationNo: 'REG-HOSP-2',
        phone: '+911199887766',
        address: 'Noida Sector 62',
        location: { latitude: 28.628, longitude: 77.3649 },
        verifiedAt: null,
        verifiedBy: null
      }
    ],
    [
      otherHospitalId,
      {
        userId: otherHospitalId,
        name: 'Max Healthcare',
        registrationNo: 'REG-HOSP-3',
        phone: '+911144556677',
        address: 'Saket, Delhi',
        location: { latitude: 28.5244, longitude: 77.2167 },
        verifiedAt: new Date(),
        verifiedBy: adminId
      }
    ]
  ]);

  const requestsStore = new Map<string, MockRecord>();
  const idempotencyStore = new Map<string, MockRecord>();
  const auditLogsStore: MockRecord[] = [];

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
            verifiedHospitalId,
            unverifiedHospitalId,
            otherHospitalId,
            bloodBankId,
            adminId,
            donorId,
            ...Array.from(requestsStore.keys())
          ].find((id) => chunk.includes(id));
          if (match) return match;
        }
        if (chunk && typeof chunk === 'object' && 'value' in chunk && typeof (chunk as { value: unknown }).value === 'string') {
          const val = (chunk as { value: string }).value;
          const uuidMatch = val.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatch) return uuidMatch[0];
          const match = [
            verifiedHospitalId,
            unverifiedHospitalId,
            otherHospitalId,
            bloodBankId,
            adminId,
            donorId,
            ...Array.from(requestsStore.keys())
          ].find((id) => val.includes(id));
          if (match) return match;
        }
      }
    }
    return undefined;
  }

  const mockDb = {
    select: (_fields?: unknown) => ({
      from: (table: unknown) => ({
        innerJoin: (_joinTable: unknown, _joinCond: unknown) => ({
          where: (condition: unknown) => ({
            limit: (_l: number) => {
              const reqId = extractId(condition);
              if (reqId && requestsStore.has(reqId)) {
                const req = requestsStore.get(reqId)!;
                const hosp = hospitalsStore.get(req.hospitalId as string);
                return [
                  {
                    request: req,
                    hospitalName: hosp?.name ?? 'Unknown Hospital',
                    hospitalAddress: hosp?.address ?? 'Unknown Address'
                  }
                ];
              }
              return [];
            },
            orderBy: () => ({
              limit: () => ({
                offset: () => []
              })
            })
          }),
          whereClause: () => {},
          orderBy: () => ({
            limit: () => ({
              offset: () =>
                Array.from(requestsStore.values()).map((req) => {
                  const hosp = hospitalsStore.get(req.hospitalId as string);
                  return {
                    request: req,
                    hospitalName: hosp?.name ?? 'Unknown Hospital',
                    hospitalAddress: hosp?.address ?? 'Unknown Address'
                  };
                })
            })
          })
        }),
        where: (condition: unknown) => ({
          limit: (_l: number) => {
            const tableName = getTableName(table);
            const id = extractId(condition);
            if (tableName === 'users' && id) {
              const u = usersStore.get(id);
              return u ? [u] : [];
            }
            if (tableName === 'hospitals' && id) {
              const h = hospitalsStore.get(id);
              return h ? [h] : [];
            }
            if (tableName === 'blood_requests' && id) {
              const r = requestsStore.get(id);
              return r ? [r] : [];
            }
            if (tableName === 'idempotency_keys') {
              function extractAllStrings(node: unknown, depth = 0): string[] {
                if (depth > 6 || !node) return [];
                if (typeof node === 'string') return [node];
                if (typeof node === 'object') {
                  const results: string[] = [];
                  if ('value' in node && typeof (node as { value: unknown }).value === 'string') {
                    results.push((node as { value: string }).value);
                  }
                  if ('queryChunks' in node && Array.isArray((node as { queryChunks: unknown[] }).queryChunks)) {
                    for (const child of (node as { queryChunks: unknown[] }).queryChunks) {
                      results.push(...extractAllStrings(child, depth + 1));
                    }
                  }
                  return results;
                }
                return [];
              }
              const extractedStrings = extractAllStrings(condition);
              for (const [k, v] of idempotencyStore.entries()) {
                const parts = k.split(':::');
                const storeUser = parts[0];
                const storeKey = parts[1];
                if (
                  extractedStrings.some((s) => s === storeKey || s.includes(storeKey!)) &&
                  extractedStrings.some((s) => s === storeUser || s.includes(storeUser!))
                ) {
                  return [v];
                }
              }
              return [];
            }
            return [];
          },
          orderBy: () => ({
            limit: () => ({
              offset: () => {
                const hospId = extractId(condition);
                if (hospId) {
                  return Array.from(requestsStore.values()).filter((r) => r.hospitalId === hospId);
                }
                return Array.from(requestsStore.values());
              }
            })
          })
        }),
        orderBy: () => ({
          limit: () => ({
            offset: () => Array.from(requestsStore.values())
          })
        })
      })
    }),
    insert: (table: unknown) => ({
      values: (values: MockRecord) => ({
        returning: () => {
          const tableName = getTableName(table);
          if (tableName === 'blood_requests') {
            const id = (values.id as string) ?? crypto.randomUUID();
            const created = {
              ...values,
              id,
              unitsFulfilled: 0,
              status: 'open',
              createdAt: new Date(),
              updatedAt: new Date()
            };
            requestsStore.set(id, created);
            return [created];
          }
          if (tableName === 'audit_logs') {
            auditLogsStore.push(values);
            return [values];
          }
          if (tableName === 'idempotency_keys') {
            const storeKey = `${values.userId}:::${values.key}`;
            idempotencyStore.set(storeKey, values);
            return [values];
          }
          return [values];
        },
        onConflictDoNothing: () => {
          const storeKey = `${values.userId}:::${values.key}`;
          idempotencyStore.set(storeKey, values);
          return Promise.resolve();
        }
      })
    }),
    update: (table: unknown) => ({
      set: (values: MockRecord) => ({
        where: (condition: unknown) => ({
          returning: () => {
            const tableName = getTableName(table);
            if (tableName === 'blood_requests') {
              const reqId = extractId(condition);
              if (reqId && requestsStore.has(reqId)) {
                const existing = requestsStore.get(reqId)!;
                const updated = { ...existing, ...values, updatedAt: new Date() };
                requestsStore.set(reqId, updated);
                return [updated];
              }
            }
            return [];
          }
        })
      })
    })
  };

  beforeAll(async () => {
    verifiedHospitalToken = await createAccessToken(
      verifiedHospitalId,
      'hospital',
      config
    );
    unverifiedHospitalToken = await createAccessToken(
      unverifiedHospitalId,
      'hospital',
      config
    );
    otherHospitalToken = await createAccessToken(
      otherHospitalId,
      'hospital',
      config
    );
    bloodBankToken = await createAccessToken(
      bloodBankId,
      'blood_bank',
      config
    );
    adminToken = await createAccessToken(
      adminId,
      'admin',
      config
    );
    donorToken = await createAccessToken(
      donorId,
      'donor',
      config
    );

    app = await buildApp({
      db: mockDb as unknown as DatabaseInstance,
      config
    });
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Role Matrix & Verification Enforcement', () => {
    const validBody = () => ({
      blood_group: 'O+',
      component: 'whole_blood',
      units_required: 2,
      urgency: 'critical',
      needed_by: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    });

    it('donor cannot create blood request (403 Forbidden)', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${donorToken}`)
        .send(validBody());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blood bank cannot create blood request (403 Forbidden)', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${bloodBankToken}`)
        .send(validBody());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('unauthenticated caller cannot create blood request (401 Unauthorized)', async () => {
      const res = await request.post('/v1/requests').send(validBody());
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('unverified hospital cannot create blood request (403 Forbidden)', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${unverifiedHospitalToken}`)
        .send(validBody());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('verified');
    });

    it('verified hospital successfully creates blood request (201 Created)', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send(validBody());
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.hospitalId).toBe(verifiedHospitalId);
      expect(res.body.status).toBe('open');
      expect(res.body.bloodGroup).toBe('O+');
      expect(res.body.unitsRequired).toBe(2);
      expect(res.body.location).toEqual({ latitude: 28.5355, longitude: 77.291 });
    });
  });

  describe('2. Location Protection & Input Validation Edge Cases', () => {
    it('location is copied strictly from hospital record, ignoring any client-sent coordinates', async () => {
      const bodyWithSpoofedCoords = {
        blood_group: 'AB-',
        component: 'plasma',
        units_required: 1,
        urgency: 'urgent',
        needed_by: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        location: { latitude: 0, longitude: 0 } // Spoofed coordinates from client
      };

      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send(bodyWithSpoofedCoords);

      expect(res.status).toBe(201);
      // Location MUST strictly match Apollo Hospital registered location, NOT client's (0, 0)
      expect(res.body.location.latitude).toBe(28.5355);
      expect(res.body.location.longitude).toBe(77.291);
    });

    it('rejects units_required < 1 with 400', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({
          blood_group: 'A+',
          component: 'rbc',
          units_required: 0,
          urgency: 'standard',
          needed_by: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });
      expect(res.status).toBe(400);
    });

    it('rejects units_required > 20 with 400', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({
          blood_group: 'A+',
          component: 'rbc',
          units_required: 21,
          urgency: 'standard',
          needed_by: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });
      expect(res.status).toBe(400);
    });

    it('rejects needed_by in the past with 400', async () => {
      const pastDate = new Date(Date.now() - 10000).toISOString();
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({
          blood_group: 'B-',
          component: 'whole_blood',
          units_required: 1,
          urgency: 'standard',
          needed_by: pastDate
        });
      expect(res.status).toBe(400);
    });

    it('rejects needed_by > 30 days in the future with 400', async () => {
      const farFutureDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({
          blood_group: 'B-',
          component: 'whole_blood',
          units_required: 1,
          urgency: 'standard',
          needed_by: farFutureDate
        });
      expect(res.status).toBe(400);
    });

    it('rejects invalid blood_group with 400', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({
          blood_group: 'INVALID',
          component: 'whole_blood',
          units_required: 1,
          urgency: 'standard',
          needed_by: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });
      expect(res.status).toBe(400);
    });
  });

  describe('3. Ownership & IDOR Protection', () => {
    let createdRequestId: string;

    beforeAll(async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({
          blood_group: 'O-',
          component: 'whole_blood',
          units_required: 1,
          urgency: 'critical',
          needed_by: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
        });
      createdRequestId = res.body.id;
    });

    it('owning hospital can access its blood request (200 OK)', async () => {
      const res = await request
        .get(`/v1/requests/${createdRequestId}`)
        .set('Authorization', `Bearer ${verifiedHospitalToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdRequestId);
      expect(res.body.hospitalId).toBe(verifiedHospitalId);
      expect(res.body).toHaveProperty('location');
    });

    it('other hospital cannot access the request (403 Forbidden)', async () => {
      const res = await request
        .get(`/v1/requests/${createdRequestId}`)
        .set('Authorization', `Bearer ${otherHospitalToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('other hospital cannot cancel the request (403 Forbidden)', async () => {
      const res = await request
        .patch(`/v1/requests/${createdRequestId}/cancel`)
        .set('Authorization', `Bearer ${otherHospitalToken}`)
        .send({ reason: 'Malicious cancellation' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blood bank receives read-only view without hospital coordinates', async () => {
      const res = await request
        .get(`/v1/requests/${createdRequestId}`)
        .set('Authorization', `Bearer ${bloodBankToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdRequestId);
      expect(res.body).toHaveProperty('hospitalName', 'Apollo Hospital');
      expect(res.body).toHaveProperty('hospitalAddress', 'Sarita Vihar, Delhi');
      expect(res.body).not.toHaveProperty('location');
    });

    it('admin receives read-only view', async () => {
      const res = await request
        .get(`/v1/requests/${createdRequestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdRequestId);
      expect(res.body).toHaveProperty('hospitalName');
    });
  });

  describe('4. Idempotency Key Double-Submit & Replay', () => {
    const idempotencyKey = 'unique-key-12345';
    const samplePayload = {
      blood_group: 'A-',
      component: 'plasma',
      units_required: 2,
      urgency: 'urgent',
      needed_by: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    };

    it('double-submit with same Idempotency-Key returns cached original response', async () => {
      const res1 = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(samplePayload);

      expect(res1.status).toBe(201);
      const originalId = res1.body.id;

      // Replay request with same key and body
      const res2 = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(samplePayload);

      expect(res2.status).toBe(201);
      expect(res2.body.id).toBe(originalId);
      expect(res2.body).toEqual(res1.body);
    });

    it('reusing same Idempotency-Key with different payload rejects with 409 Conflict', async () => {
      const modifiedPayload = {
        ...samplePayload,
        units_required: 5
      };

      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(modifiedPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('5. Cancellation Lifecycle & State Machine', () => {
    let cancelTargetId: string;

    beforeAll(async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({
          blood_group: 'B+',
          component: 'whole_blood',
          units_required: 1,
          urgency: 'standard',
          needed_by: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
        });
      cancelTargetId = res.body.id;
    });

    it('owning hospital successfully cancels request (200 OK)', async () => {
      const res = await request
        .patch(`/v1/requests/${cancelTargetId}/cancel`)
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({ reason: 'Fulfilled through local blood bank' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });

    it('repeating cancellation of already cancelled request rejects with 409 Conflict', async () => {
      const res = await request
        .patch(`/v1/requests/${cancelTargetId}/cancel`)
        .set('Authorization', `Bearer ${verifiedHospitalToken}`)
        .send({ reason: 'Repeated cancel' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });
});
