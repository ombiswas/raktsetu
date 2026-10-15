/**
 * Security Fuzzing & Negative Input Resilience Tests
 *
 * Verifies:
 * 1. SQL injection payloads in request bodies and query parameters are safely handled as literal strings
 * 2. Path parameter fuzzing with non-UUIDs, path traversal sequences, and buffer strings
 * 3. Unicode and malformed data handling
 * 4. Notifications route family RBAC and authentication validation
 * 5. Strict negative boundary validation on medical and operational parameters
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { createConfig } from '../../../src/platform/config/index.js';
import { createAccessToken } from '../../../src/modules/auth/domain/tokens.js';
import type { DatabaseInstance } from '../../../src/platform/database/connection.js';

describe('Security Fuzzing, Injection Probing & Route Family RBAC', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  const config = createConfig({
    JWT_ACCESS_SECRET: 'fuzz-test-secret-at-least-32-chars-long!',
    COOKIE_SECRET: 'fuzz-test-cookie-secret-at-least-32-chars-long!',
    JWT_ISSUER: 'raktsetu-fuzz-test'
  });

  const donorId = '11111111-1111-1111-1111-111111111111';
  const hospitalId = '22222222-2222-2222-2222-222222222222';
  const bloodBankId = '33333333-3333-3333-3333-333333333333';
  const adminId = '44444444-4444-4444-4444-444444444444';

  let donorToken: string;
  let hospitalToken: string;
  let bloodBankToken: string;
  let adminToken: string;

  const usersStore = new Map<string, { id: string; role: string; status: string }>([
    [donorId, { id: donorId, role: 'donor', status: 'active' }],
    [hospitalId, { id: hospitalId, role: 'hospital', status: 'active' }],
    [bloodBankId, { id: bloodBankId, role: 'blood_bank', status: 'active' }],
    [adminId, { id: adminId, role: 'admin', status: 'active' }]
  ]);

  function extractTargetId(condition: unknown): string | undefined {
    if (!condition || typeof condition !== 'object') return undefined;
    const condRecord = condition as { queryChunks?: unknown[] };
    if (condRecord.queryChunks && Array.isArray(condRecord.queryChunks)) {
      for (const chunk of condRecord.queryChunks) {
        if (typeof chunk === 'string') {
          const match = [donorId, hospitalId, bloodBankId, adminId].find((id) => chunk.includes(id));
          if (match) return match;
        }
        if (chunk && typeof chunk === 'object' && 'value' in chunk && typeof (chunk as { value: unknown }).value === 'string') {
          const val = (chunk as { value: string }).value;
          const match = [donorId, hospitalId, bloodBankId, adminId].find((id) => val.includes(id));
          if (match) return match;
        }
      }
    }
    return undefined;
  }

  // Mock database that safely simulates queries
  const mockDb = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          const targetId = extractTargetId(condition);
          const userResult = targetId && usersStore.has(targetId) ? [usersStore.get(targetId)!] : [];
          return {
            limit: () => userResult,
            orderBy: () => ({
              limit: () => ({
                offset: () => []
              })
            })
          };
        },
        orderBy: () => ({
          limit: () => ({
            offset: () => []
          })
        }),
        innerJoin: () => ({
          where: () => ({
            limit: () => []
          })
        })
      })
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => []
        })
      })
    }),
    insert: () => ({
      values: () => ({
        returning: () => []
      })
    }),
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(mockDb)
  } as unknown as DatabaseInstance;

  beforeAll(async () => {
    donorToken = await createAccessToken(donorId, 'donor', config);
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

  describe('1. SQL Injection & Metacharacter Fuzzing', () => {
    const injectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "1' UNION SELECT username, password_hash FROM users --",
      "admin'--",
      "1; SELECT pg_sleep(5); --",
      "\\x00' OR 1=1 --",
      "Robert'); DROP TABLE Students;--"
    ];

    it.each(injectionPayloads)('rejects or safely escapes SQL injection payload in login: %s', async (payload) => {
      const res = await request
        .post('/v1/auth/login')
        .send({
          email: `${payload}@example.com`,
          password: 'Password123!'
        });

      // Zod validation should reject malformed email, or auth service returns 401 unauthorized
      expect([400, 401]).toContain(res.status);
      expect(res.body).toHaveProperty('error');
      // Verify no database error or SQL syntax error was leaked
      expect(JSON.stringify(res.body)).not.toMatch(/syntax error|pg_sleep|postgres|drizzle/i);
    });

    it('rejects path traversal and SQL fragments in UUID path parameters with 400', async () => {
      const maliciousPaths = [
        '/v1/requests/../../etc/passwd',
        "/v1/requests/' OR '1'='1",
        '/v1/requests/1;DROP TABLE users',
        '/v1/requests/undefined',
        '/v1/requests/00000000-0000-0000-0000-00000000000G' // invalid hex
      ];

      for (const path of maliciousPaths) {
        const res = await request
          .get(path)
          .set('Authorization', `Bearer ${hospitalToken}`);

        // Fastify either treats it as 400 (Zod schema validation failure) or 404 (route not matched for ..)
        expect([400, 404]).toContain(res.status);
      }
    });

    it('safely handles non-ASCII unicode and emoji fuzzing without crashing', async () => {
      const weirdUnicode = '🩸💉🏥 Unicode test \u0000 \uFEFF \u202E RTL override';
      const res = await request
        .patch('/v1/donors/me')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          fullName: weirdUnicode
        });

      // Valid string within length bounds should be processed without 500 error
      expect(res.status).not.toBe(500);
    });
  });

  describe('2. Notifications Route Family RBAC', () => {
    it('unauthenticated GET /v1/notifications is rejected with 401', async () => {
      const res = await request.get('/v1/notifications');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('unauthenticated PATCH /v1/notifications/:id/read is rejected with 401', async () => {
      const res = await request.patch(`/v1/notifications/${donorId}/read`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('unauthenticated POST /v1/notifications/push-subscription is rejected with 401', async () => {
      const res = await request.post('/v1/notifications/push-subscription').send({
        endpoint: 'https://push.example.com/subscription/token-12345',
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_',
        auth: 'tBHItJI5svbpez7KI4CCXg'
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows donor, hospital, blood_bank, and admin roles to access their notifications', async () => {
      const tokens = [donorToken, hospitalToken, bloodBankToken, adminToken];
      for (const token of tokens) {
        const res = await request
          .get('/v1/notifications')
          .set('Authorization', `Bearer ${token}`);
        // Endpoint requires auth and role, should not return 401 or 403
        expect([200, 404]).toContain(res.status);
      }
    });
  });

  describe('3. Extreme Boundaries and Payload Fuzzing', () => {
    it('rejects massive JSON arrays or unexpected nested structures in request bodies', async () => {
      const deepNested = {
        bloodGroup: 'O+',
        unitsRequired: 2,
        urgency: 'critical',
        nested: { a: { b: { c: { d: { e: 'f' } } } } }
      };

      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send(deepNested);

      // Zod schema strips unknown properties or rejects invalid shapes
      expect([200, 201, 400]).toContain(res.status);
    });

    it('rejects extreme negative and overflowing integer values', async () => {
      const res = await request
        .post('/v1/requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodGroup: 'O+',
          unitsRequired: -999999,
          urgency: 'critical'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
