import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { createConfig } from '../../../src/platform/config/index.js';
import { createAccessToken } from '../../../src/modules/auth/domain/tokens.js';
import type { DatabaseInstance } from '../../../src/platform/database/connection.js';

type MockRecord = Record<string, unknown>;

describe('Authorization Matrix, IDOR Scoping & Validation Edge Cases', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  const config = createConfig({
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-chars-long!',
    COOKIE_SECRET: 'test-cookie-secret-at-least-32-chars-long!',
    JWT_ISSUER: 'raktsetu-authz-test'
  });

  // Mock principals
  const donorId = '11111111-1111-1111-1111-111111111111';
  const otherDonorId = '99999999-9999-9999-9999-999999999999';
  const hospitalId = '22222222-2222-2222-2222-222222222222';
  const bloodBankId = '33333333-3333-3333-3333-333333333333';
  const adminId = '44444444-4444-4444-4444-444444444444';

  let donorToken: string;
  let otherDonorToken: string;
  let hospitalToken: string;
  let bloodBankToken: string;
  let adminToken: string;

  // In-memory data store for mock DB
  const now = new Date();
  const usersStore = new Map<string, MockRecord>([
    [donorId, { id: donorId, email: 'donor@example.com', role: 'donor', status: 'active', createdAt: now }],
    [otherDonorId, { id: otherDonorId, email: 'other.donor@example.com', role: 'donor', status: 'active', createdAt: now }],
    [hospitalId, { id: hospitalId, email: 'hospital@example.com', role: 'hospital', status: 'active', createdAt: now }],
    [bloodBankId, { id: bloodBankId, email: 'bloodbank@example.com', role: 'blood_bank', status: 'active', createdAt: now }],
    [adminId, { id: adminId, email: 'admin@example.com', role: 'admin', status: 'active', createdAt: now }]
  ]);

  const donorProfileStore = new Map<string, MockRecord>([
    [
      donorId,
      {
        userId: donorId,
        fullName: 'Test Donor',
        phone: '+919876543210',
        bloodGroup: 'O+',
        dateOfBirth: '1995-01-01',
        weightKg: 65,
        sex: 'male',
        isAvailable: true,
        availableFrom: null,
        eligibleAfter: null,
        lastDonationDate: null,
        location: { latitude: 28.6, longitude: 77.2 },
        locationUpdatedAt: new Date(),
        consentLocationAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    [
      otherDonorId,
      {
        userId: otherDonorId,
        fullName: 'Other Donor',
        phone: '+919123456789',
        bloodGroup: 'A+',
        dateOfBirth: '1990-01-01',
        weightKg: 70,
        sex: 'female',
        isAvailable: false,
        availableFrom: null,
        eligibleAfter: null,
        lastDonationDate: null,
        location: { latitude: 28.5, longitude: 77.1 },
        locationUpdatedAt: new Date(),
        consentLocationAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);

  const hospitalProfileStore = new Map<string, MockRecord>([
    [
      hospitalId,
      {
        userId: hospitalId,
        name: 'Apollo Hospital',
        registrationNo: 'REG-100',
        phone: '+911122334455',
        address: 'Delhi',
        location: { latitude: 28.6, longitude: 77.2 },
        verifiedAt: new Date(),
        verifiedBy: adminId,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);

  const bloodBankProfileStore = new Map<string, MockRecord>([
    [
      bloodBankId,
      {
        userId: bloodBankId,
        name: 'Red Cross Center',
        licenseNo: 'LIC-200',
        phone: '+911199887766',
        address: 'Delhi',
        location: { latitude: 28.6, longitude: 77.2 },
        verifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);

  function extractTargetId(condition: unknown): string | undefined {
    if (!condition || typeof condition !== 'object') return undefined;
    const condRecord = condition as { queryChunks?: unknown[] };
    if (condRecord.queryChunks && Array.isArray(condRecord.queryChunks)) {
      for (const chunk of condRecord.queryChunks) {
        if (typeof chunk === 'string') {
          const match = [donorId, otherDonorId, hospitalId, bloodBankId, adminId].find((id) => chunk.includes(id));
          if (match) return match;
        }
        if (chunk && typeof chunk === 'object' && 'value' in chunk && typeof (chunk as { value: unknown }).value === 'string') {
          const val = (chunk as { value: string }).value;
          const match = [donorId, otherDonorId, hospitalId, bloodBankId, adminId].find((id) => val.includes(id));
          if (match) return match;
        }
      }
    }
    return undefined;
  }

  function getTableName(table: unknown): string {
    if (!table || typeof table !== 'object') return '';
    const drizzleName = (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')];
    if (typeof drizzleName === 'string') return drizzleName;
    const internal = (table as { _?: { name?: string } })._?.name;
    if (typeof internal === 'string') return internal;
    return '';
  }

  // Mock Database instance implementing select/update
  const mockDb = {
    select: (_fields?: unknown) => ({
      from: (_table: unknown) => ({
        innerJoin: (_joinTable: unknown, _condition: unknown) => ({
          where: (condition: unknown) => ({
            limit: (_l: number) => {
              const targetUserId = extractTargetId(condition);
              if (!targetUserId) return [];
              const u = usersStore.get(targetUserId);
              const d = donorProfileStore.get(targetUserId);
              const h = hospitalProfileStore.get(targetUserId);
              const b = bloodBankProfileStore.get(targetUserId);
              if (d) return [{ ...d, id: d.userId, email: u?.email }];
              if (h) return [{ ...h, id: h.userId, email: u?.email }];
              if (b) return [{ ...b, id: b.userId, email: u?.email }];
              return [];
            },
            orderBy: () => []
          })
        }),
        where: (condition: unknown) => ({
          limit: (_l: number) => {
            const targetUserId = extractTargetId(condition);
            if (targetUserId) {
              const tableName = getTableName(_table);
              if (tableName === 'hospitals') {
                const h = hospitalProfileStore.get(targetUserId);
                return h ? [h] : [];
              }
              if (tableName === 'blood_banks') {
                const b = bloodBankProfileStore.get(targetUserId);
                return b ? [b] : [];
              }
              if (tableName === 'donors') {
                const d = donorProfileStore.get(targetUserId);
                return d ? [d] : [];
              }
              const u = usersStore.get(targetUserId);
              return u ? [u] : [];
            }
            return [];
          },
          orderBy: () => ({
            limit: () => ({
              offset: () => Array.from(usersStore.values())
            })
          })
        }),
        orderBy: () => ({
          limit: () => ({
            offset: () => Array.from(usersStore.values())
          })
        })
      })
    }),
    update: (_table: unknown) => ({
      set: (values: MockRecord) => ({
        where: (condition: unknown) => ({
          returning: () => {
            const targetUserId = extractTargetId(condition);
            if (!targetUserId) return [];
            if (donorProfileStore.has(targetUserId)) {
              const existing = donorProfileStore.get(targetUserId);
              const updated = { ...existing, ...values };
              donorProfileStore.set(targetUserId, updated);
              return [updated];
            }
            if (hospitalProfileStore.has(targetUserId)) {
              const existing = hospitalProfileStore.get(targetUserId);
              const updated = { ...existing, ...values };
              hospitalProfileStore.set(targetUserId, updated);
              return [updated];
            }
            if (bloodBankProfileStore.has(targetUserId)) {
              const existing = bloodBankProfileStore.get(targetUserId);
              const updated = { ...existing, ...values };
              bloodBankProfileStore.set(targetUserId, updated);
              return [updated];
            }
            if (usersStore.has(targetUserId)) {
              const existing = usersStore.get(targetUserId);
              const updated = { ...existing, ...values };
              usersStore.set(targetUserId, updated);
              return [updated];
            }
            return [];
          }
        })
      })
    }),
    insert: (_table: unknown) => ({
      values: (val: MockRecord) => ({
        returning: () => [{ id: 'mock-inserted-id', ...val }]
      })
    }),
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(mockDb)
  } as unknown as DatabaseInstance;

  beforeAll(async () => {
    donorToken = await createAccessToken(donorId, 'donor', config);
    otherDonorToken = await createAccessToken(otherDonorId, 'donor', config);
    hospitalToken = await createAccessToken(hospitalId, 'hospital', config);
    bloodBankToken = await createAccessToken(bloodBankId, 'blood_bank', config);
    adminToken = await createAccessToken(adminId, 'admin', config);

    app = await buildApp({
      config,
      db: mockDb,
      checkDatabase: async () => true
    });

    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Role-Based Access Control Matrix (403 Forbidden)', () => {
    it('donor cannot access hospital endpoints (403)', async () => {
      const res = await request
        .get('/v1/hospitals/me')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('donor cannot access blood bank endpoints (403)', async () => {
      const res = await request
        .get('/v1/blood-banks/me')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('donor cannot access admin endpoints (403)', async () => {
      const res = await request
        .get('/v1/admin/accounts')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('hospital cannot access donor self-service endpoints (403)', async () => {
      const res = await request
        .get('/v1/donors/me')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('hospital cannot access admin accounts management (403)', async () => {
      const res = await request
        .get('/v1/admin/accounts')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blood bank cannot access donor self-service endpoints (403)', async () => {
      const res = await request
        .get('/v1/donors/me')
        .set('Authorization', `Bearer ${bloodBankToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blood bank cannot access admin accounts management (403)', async () => {
      const res = await request
        .get('/v1/admin/accounts')
        .set('Authorization', `Bearer ${bloodBankToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('admin can access admin accounts endpoint (200)', async () => {
      const res = await request
        .get('/v1/admin/accounts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accounts');
    });

    it('unauthenticated request is rejected (401)', async () => {
      const res = await request.get('/v1/donors/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Insecure Direct Object Reference (IDOR) Scoping Proof', () => {
    it('donor GET /v1/donors/me strictly returns the caller profile, never another donor', async () => {
      const resDonor1 = await request
        .get('/v1/donors/me')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(resDonor1.status).toBe(200);
      expect(resDonor1.body.id).toBe(donorId);
      expect(resDonor1.body.fullName).toBe('Test Donor');

      const resDonor2 = await request
        .get('/v1/donors/me')
        .set('Authorization', `Bearer ${otherDonorToken}`);

      expect(resDonor2.status).toBe(200);
      expect(resDonor2.body.id).toBe(otherDonorId);
      expect(resDonor2.body.fullName).toBe('Other Donor');

      // Assert complete separation: caller 1 never receives caller 2's data
      expect(resDonor1.body.id).not.toBe(resDonor2.body.id);
    });

    it('donor PATCH /v1/donors/me scopes strictly to token subject; cannot modify other donor via body injection', async () => {
      // Attempting to send `{ id: otherDonorId, fullName: 'Hacked' }`
      const res = await request
        .patch('/v1/donors/me')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          id: otherDonorId, // Attacker tries to target other donor
          fullName: 'Attempted Attacker Name'
        });

      // Zod strict schema rejects unknown field 'id'
      expect(res.status).toBe(400);

      // Verify other donor was untouched
      const untouched = donorProfileStore.get(otherDonorId) as { fullName: string };
      expect(untouched.fullName).toBe('Other Donor');
    });
  });

  describe('3. Validation Edge Cases', () => {
    it('rejects latitude > 90 degrees with 400', async () => {
      const res = await request
        .put('/v1/donors/me/location')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          latitude: 91.0,
          longitude: 77.2,
          consentGiven: true
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details)).toMatch(/Latitude must be between -90 and 90/i);
    });

    it('rejects latitude < -90 degrees with 400', async () => {
      const res = await request
        .put('/v1/donors/me/location')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          latitude: -90.5,
          longitude: 77.2,
          consentGiven: true
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects longitude > 180 degrees with 400', async () => {
      const res = await request
        .put('/v1/donors/me/location')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          latitude: 28.5,
          longitude: 181.0,
          consentGiven: true
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details)).toMatch(/Longitude must be between -180 and 180/i);
    });

    it('rejects missing or false consentGiven flag with 400', async () => {
      const res = await request
        .put('/v1/donors/me/location')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          latitude: 28.5,
          longitude: 77.2,
          consentGiven: false
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details)).toMatch(/consent/i);
    });

    it('rejects donor weight below 45kg with 400', async () => {
      const res = await request
        .patch('/v1/donors/me')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({ weightKg: 44 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details)).toMatch(/at least 45 kg/i);
    });

    it('rejects huge strings exceeding max length with 400', async () => {
      const hugeName = 'A'.repeat(101);
      const res = await request
        .patch('/v1/donors/me')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({ fullName: hugeName });

      expect(res.status).toBe(400);
    });

    it('rejects blood bank donation units > 10 with 400', async () => {
      const res = await request
        .post('/v1/blood-banks/me/donations')
        .set('Authorization', `Bearer ${bloodBankToken}`)
        .send({
          donorId,
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 11
        });

      expect(res.status).toBe(400);
    });

    it('rejects blood bank donation units <= 0 with 400', async () => {
      const res = await request
        .post('/v1/blood-banks/me/donations')
        .set('Authorization', `Bearer ${bloodBankToken}`)
        .send({
          donorId,
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 0
        });

      expect(res.status).toBe(400);
    });

    it('rejects blood bank deferral with invalid date format with 400', async () => {
      const res = await request
        .post(`/v1/blood-banks/donors/${donorId}/defer`)
        .set('Authorization', `Bearer ${bloodBankToken}`)
        .send({
          eligibleAfter: '01-01-2026', // wrong format, should be YYYY-MM-DD
          reason: 'Medical deferral'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('4. Transaction Rollback Safety', () => {
    it('aborts and rolls back when donation recording fails mid-way', async () => {
      // Create a repository that simulates mid-transaction failure
      const failingDb = {
        transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
          let step1Complete = false;
          try {
            await cb({
              insert: () => ({
                values: () => ({
                  returning: () => {
                    step1Complete = true;
                    return [{ id: 'donation-fail-test', donorId, bloodBankId, units: 1, donatedAt: new Date() }];
                  }
                })
              }),
              update: () => {
                // Simulate database crash on donor update
                throw new Error('Database connection interrupted mid-transaction');
              },
              select: () => ({
                from: () => ({
                  where: () => ({
                    limit: () => []
                  })
                })
              })
            });
            throw new Error('Should not reach here');
          } catch (err) {
            // Transaction aborts!
            expect(step1Complete).toBe(true);
            throw err;
          }
        }
      } as unknown as DatabaseInstance;

      const { BloodBanksRepository } = await import('../../../src/modules/blood-banks/blood-banks.repository.js');
      const failingRepo = new BloodBanksRepository(failingDb);

      await expect(
        failingRepo.recordDonationTransaction({
          bloodBankId,
          donorId,
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 1,
          donatedAt: new Date()
        })
      ).rejects.toThrow('Database connection interrupted mid-transaction');
    });
  });
});
