import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  createDrizzle,
  type DatabaseInstance
} from '../../src/platform/database/connection.js';
import { runMigrations } from '../../src/platform/database/migrate.js';
import { buildApp } from '../../src/app.js';
import { createConfig } from '../../src/platform/config/index.js';

import { authorize, createAuthenticateGuard } from '../../src/platform/http/guards/index.js';
import { REFRESH_COOKIE_NAME } from '../../src/modules/auth/domain/tokens.js';
import { SignJWT } from 'jose';

const { Pool } = pg;

describe('Authentication & Authorization Integration Tests', () => {
  let container: StartedPostgreSqlContainer | null = null;
  let pool: pg.Pool;
  let db: DatabaseInstance;
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  const testConfig = createConfig({
    DATABASE_URL: 'postgres://postgres:postgrespassword@localhost:5432/raktsetu',
    JWT_ACCESS_SECRET: 'test-jwt-secret-minimum-32-chars-long-strictly!',
    COOKIE_SECRET: 'test-cookie-secret-min-32-chars-long-strictly!',
    JWT_ISSUER: 'raktsetu-auth-test',
    CORS_ORIGINS: 'http://localhost:5173,https://app.raktsetu.org'
  });

  beforeAll(async () => {
    let connectionString: string;
    if (process.env.TEST_DATABASE_URL) {
      connectionString = process.env.TEST_DATABASE_URL;
    } else {
      try {
        console.log('Starting Testcontainers PostGIS container...');
        container = await new PostgreSqlContainer('postgis/postgis:16-3.4')
          .withDatabase('raktsetu_auth_test')
          .withUsername('auth_user')
          .withPassword('auth_pass')
          .start();
        connectionString = container.getConnectionUri();
      } catch (err) {
        console.warn('Falling back to local DATABASE_URL for integration tests:', err);
        connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/raktsetu';
      }
    }

    pool = new Pool({ connectionString, max: 5 });
    db = createDrizzle(pool);

    // Apply migrations from scratch (including 0000 and 0001)
    await runMigrations(db);

    // Build the Fastify app using the test DB
    app = await buildApp({
      config: testConfig,
      db,
      checkDatabase: async () => true
    });

    // Add a hospital-only dummy route to test role escalation guards
    const authenticate = createAuthenticateGuard(db, testConfig);
    app.get(
      '/v1/hospital-portal/dashboard',
      {
        config: { auth: true, roles: ['hospital', 'admin'] },
        preHandler: [authenticate, authorize('hospital', 'admin')]
      },
      async () => ({ message: 'Welcome Hospital Admin' })
    );

    await app.ready();
    request = supertest(app.server);
  }, 120000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
  });

  describe('Registration Workflows', () => {
    it('registers donor and activates account immediately (status: active)', async () => {
      const res = await request
        .post('/v1/auth/register/donor')
        .send({
          email: 'donor.new@example.com',
          password: 'ValidSecurePassphrase2026!',
          fullName: 'Test Donor One',
          phone: '+919876543210',
          bloodGroup: 'O+',
          dateOfBirth: '1998-05-15',
          weightKg: 65,
          sex: 'male',
          location: { latitude: 30.3256, longitude: 78.0436 }
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Donor registered successfully');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('donor');
      expect(res.body.user.status).toBe('active');
      expect(res.body.user.email).toBe('donor.new@example.com');
      // Verify NO password hash is exposed
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('argon2id');
    });

    it('rejects donor registration with weak/short password', async () => {
      const res = await request
        .post('/v1/auth/register/donor')
        .send({
          email: 'weak.donor@example.com',
          password: 'short',
          fullName: 'Weak Donor',
          phone: '+919876543211',
          bloodGroup: 'A+',
          dateOfBirth: '2000-01-01',
          weightKg: 55,
          sex: 'female',
          location: { latitude: 30.32, longitude: 78.04 }
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects donor registration with common password', async () => {
      const res = await request
        .post('/v1/auth/register/donor')
        .send({
          email: 'common.donor@example.com',
          password: 'password1234',
          fullName: 'Common Donor',
          phone: '+919876543212',
          bloodGroup: 'B+',
          dateOfBirth: '1995-01-01',
          weightKg: 70,
          sex: 'male',
          location: { latitude: 30.32, longitude: 78.04 }
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/common/i);
    });

    it('registers hospital with status pending (requiring admin approval)', async () => {
      const res = await request
        .post('/v1/auth/register/hospital')
        .send({
          email: 'doon.hospital.new@example.com',
          password: 'HospitalSecurePassword2026!',
          name: 'City Care Hospital',
          registrationNo: 'REG-HOSP-2026-999',
          phone: '+911352999000',
          address: 'Main Rajpur Road, Dehradun',
          location: { latitude: 30.34, longitude: 78.06 }
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('hospital');
      expect(res.body.user.status).toBe('pending');
      expect(res.body.message).toContain('pending approval');
    });

    it('registers blood bank with status pending', async () => {
      const res = await request
        .post('/v1/auth/register/blood-bank')
        .send({
          email: 'regional.bloodbank@example.com',
          password: 'BloodBankSecurePass2026!',
          name: 'Regional Blood Bank Centre',
          licenseNo: 'LIC-BB-2026-888',
          phone: '+911352888000',
          address: 'Subhash Road, Dehradun',
          location: { latitude: 30.31, longitude: 78.03 }
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('blood_bank');
      expect(res.body.user.status).toBe('pending');
    });

    it('rejects duplicate email registrations with ConflictError (409)', async () => {
      const res = await request
        .post('/v1/auth/register/donor')
        .send({
          email: 'donor.new@example.com', // Already registered
          password: 'AnotherSecurePass2026!',
          fullName: 'Duplicate Donor',
          phone: '+919876543299',
          bloodGroup: 'AB+',
          dateOfBirth: '1999-01-01',
          weightKg: 60,
          sex: 'other',
          location: { latitude: 30.32, longitude: 78.04 }
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Login & Hardening', () => {
    it('authenticates active donor and returns access token + refresh cookie', async () => {
      const res = await request
        .post('/v1/auth/login')
        .send({
          email: 'DONOR.NEW@EXAMPLE.COM', // Tests case-insensitivity
          password: 'ValidSecurePassphrase2026!'
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user.role).toBe('donor');
      expect(res.body.user.status).toBe('active');

      // Check refresh token cookie flags
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;
      expect(cookieStr).toContain(REFRESH_COOKIE_NAME);
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Strict');
      expect(cookieStr).toContain('Path=/v1/auth');

      // Ensure NO passwordHash or tokenHash in body
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('argon2id');
    });

    it('blocks pending hospital from logging in with 403 Forbidden', async () => {
      const res = await request
        .post('/v1/auth/login')
        .send({
          email: 'doon.hospital.new@example.com',
          password: 'HospitalSecurePassword2026!'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/pending administrator approval/i);
    });

    it('returns identical 401 error message for wrong password and nonexistent email', async () => {
      const wrongPassRes = await request
        .post('/v1/auth/login')
        .send({
          email: 'donor.new@example.com',
          password: 'IncorrectPassword123!'
        });

      const unknownEmailRes = await request
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent.user.random@example.com',
          password: 'AnyPasswordAttempt123!'
        });

      expect(wrongPassRes.status).toBe(401);
      expect(unknownEmailRes.status).toBe(401);
      expect(wrongPassRes.body.error.message).toBe('Invalid email or password');
      expect(unknownEmailRes.body.error.message).toBe('Invalid email or password');
      expect(wrongPassRes.body.error.code).toBe('UNAUTHORIZED');
      expect(unknownEmailRes.body.error.code).toBe('UNAUTHORIZED');
    });

    it('temporarily locks account after 5 consecutive failed login attempts', async () => {
      const targetEmail = 'lockout.test@example.com';

      // Register donor first
      await request.post('/v1/auth/register/donor').send({
        email: targetEmail,
        password: 'ValidPassword12345!',
        fullName: 'Lockout Target',
        phone: '+919999900001',
        bloodGroup: 'B-',
        dateOfBirth: '1990-01-01',
        weightKg: 70,
        sex: 'male',
        location: { latitude: 30.3, longitude: 78.0 }
      });

      // Attempt 4 failures -> still 401
      for (let i = 0; i < 4; i++) {
        const failRes = await request.post('/v1/auth/login').send({
          email: targetEmail,
          password: 'BadPasswordAttempt1!'
        });
        expect(failRes.status).toBe(401);
      }

      // 5th failure -> triggers temporary lockout
      const fifthFail = await request.post('/v1/auth/login').send({
        email: targetEmail,
        password: 'BadPasswordAttempt1!'
      });
      expect(fifthFail.status).toBe(401);

      // 6th attempt (even with CORRECT password) is now rejected with 403 Forbidden due to lockout!
      const lockedRes = await request.post('/v1/auth/login').send({
        email: targetEmail,
        password: 'ValidPassword12345!'
      });

      expect(lockedRes.status).toBe(403);
      expect(lockedRes.body.error.code).toBe('FORBIDDEN');
      expect(lockedRes.body.error.message).toMatch(/temporarily locked/i);

      // Clean up login_attempts so IP lockout doesn't leak into subsequent test suites
      await pool.query('DELETE FROM login_attempts');
    });
  });

  describe('Protected Endpoints & Guard Enforcement', () => {
    let donorToken: string;

    beforeAll(async () => {
      const loginRes = await request.post('/v1/auth/login').send({
        email: 'donor.new@example.com',
        password: 'ValidSecurePassphrase2026!'
      });
      donorToken = loginRes.body.accessToken;
    });

    it('GET /v1/auth/me returns current user profile with valid Bearer JWT', async () => {
      const res = await request
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('donor.new@example.com');
      expect(res.body.user.role).toBe('donor');
    });

    it('rejects GET /v1/auth/me without Authorization header', async () => {
      const res = await request.get('/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects forged JWT with 401 Unauthorized', async () => {
      const forgedToken = await new SignJWT({ role: 'admin' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('attacker-id')
        .setJti('forged-jti')
        .setIssuer(testConfig.JWT_ISSUER)
        .setAudience('raktsetu-api')
        .setExpirationTime('15m')
        .sign(new TextEncoder().encode('completely-wrong-forged-secret-32-chars!'));

      const res = await request
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
    });

    it('blocks role escalation: donor cannot access hospital-restricted endpoint (403 Forbidden)', async () => {
      const res = await request
        .get('/v1/hospital-portal/dashboard')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/insufficient permissions/i);
    });
  });

  describe('Rotating Refresh Tokens & Theft Detection', () => {
    let refreshCookie: string;
    let initialAccessToken: string;

    beforeAll(async () => {
      const loginRes = await request.post('/v1/auth/login').send({
        email: 'donor.new@example.com',
        password: 'ValidSecurePassphrase2026!'
      });
      initialAccessToken = loginRes.body.accessToken;
      refreshCookie = loginRes.headers['set-cookie']![0]!;
    });

    it('POST /v1/auth/refresh rotates refresh token and issues new access JWT', async () => {
      const res = await request
        .post('/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .set('X-Requested-With', 'raktsetu')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.accessToken).not.toBe(initialAccessToken);
      expect(res.body.expiresIn).toBe(900);

      // Verify new refresh cookie is returned
      const newCookies = res.headers['set-cookie'];
      expect(newCookies).toBeDefined();
      expect(newCookies![0]).toContain(REFRESH_COOKIE_NAME);
    });

    it('theft detection: reusing an already rotated refresh token revokes the whole family', async () => {
      // Re-use the OLD initial refreshCookie that has already been rotated!
      const reusedRes = await request
        .post('/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .set('X-Requested-With', 'raktsetu')
        .set('Origin', 'http://localhost:5173');

      expect(reusedRes.status).toBe(401);
      expect(reusedRes.body.error.message).toMatch(/compromised|invalid/i);

      // Check audit logs for theft detection event
      const { rows: [auditEvent] } = await pool.query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE action = 'auth.token.theft_detected' LIMIT 1"
      );
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.action).toBe('auth.token.theft_detected');
    });

    it('POST /v1/auth/refresh rejects requests missing X-Requested-With header (CSRF protection)', async () => {
      const res = await request
        .post('/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .set('Origin', 'http://localhost:5173');
      // Intentionally missing X-Requested-With

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/X-Requested-With/i);
    });

    it('POST /v1/auth/refresh rejects requests from unauthorized Origin (CSRF protection)', async () => {
      const res = await request
        .post('/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .set('X-Requested-With', 'raktsetu')
        .set('Origin', 'https://malicious-evil-site.com');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/Origin .* is not permitted/i);
    });

    it('POST /v1/auth/logout revokes refresh token and clears cookie', async () => {
      // Login again to obtain fresh cookie
      const loginRes = await request.post('/v1/auth/login').send({
        email: 'donor.new@example.com',
        password: 'ValidSecurePassphrase2026!'
      });
      const freshCookie = loginRes.headers['set-cookie']![0]!;

      const logoutRes = await request
        .post('/v1/auth/logout')
        .set('Cookie', freshCookie)
        .set('X-Requested-With', 'raktsetu')
        .set('Origin', 'http://localhost:5173');

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toBe('Logged out successfully');

      // Subsequent refresh with that token must fail
      const refreshAfterLogout = await request
        .post('/v1/auth/refresh')
        .set('Cookie', freshCookie)
        .set('X-Requested-With', 'raktsetu')
        .set('Origin', 'http://localhost:5173');

      expect(refreshAfterLogout.status).toBe(401);
    });
  });

  describe('Audit Trail & Privacy', () => {
    it('verifies audit logs are created and IP address is pseudonymous (hashed with pepper)', async () => {
      const rows = await pool.query<{ action: string; ip_hash: string | null }>(
        'SELECT action, ip_hash FROM audit_logs WHERE ip_hash IS NOT NULL LIMIT 5'
      );

      expect(rows.rows.length).toBeGreaterThan(0);
      for (const row of rows.rows) {
        expect(row.ip_hash).toBeDefined();
        // 32-byte HMAC-SHA256 hex string = 64 characters
        expect(row.ip_hash).toHaveLength(64);
        // Raw IP must never be stored
        expect(row.ip_hash).not.toContain('127.0.0.1');
        expect(row.ip_hash).not.toContain('::1');
      }
    });
  });
});
