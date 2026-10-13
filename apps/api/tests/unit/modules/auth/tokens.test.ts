import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import {
  createAccessToken,
  verifyAccessToken,
  generateOpaqueRefreshToken,
  hashRefreshToken,
  getRefreshCookieOptions,
  REFRESH_COOKIE_NAME
} from '../../../../src/modules/auth/domain/tokens.js';
import { createConfig } from '../../../../src/platform/config/index.js';
import { UnauthorizedError } from '../../../../src/platform/http/errors.js';

describe('Tokens Domain Service', () => {
  const cfg = createConfig({
    JWT_ACCESS_SECRET: 'super-secure-jwt-secret-minimum-32-chars-long!',
    JWT_ISSUER: 'raktsetu-api-test',
    COOKIE_SECRET: 'super-secure-cookie-secret-min-32-chars-long!'
  });

  describe('Access JWT Generation & Verification', () => {
    it('creates and verifies a valid HS256 access JWT', async () => {
      const userId = '11111111-2222-3333-4444-555555555555';
      const role = 'donor';

      const token = await createAccessToken(userId, role, cfg);
      expect(typeof token).toBe('string');

      const verified = await verifyAccessToken(token, cfg);
      expect(verified.userId).toBe(userId);
      expect(verified.role).toBe(role);
      expect(typeof verified.jti).toBe('string');
    });

    it('rejects expired access JWT', async () => {
      const secret = new TextEncoder().encode(cfg.JWT_ACCESS_SECRET);
      const expiredToken = await new SignJWT({ role: 'donor' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('user-123')
        .setJti('jti-123')
        .setIssuer(cfg.JWT_ISSUER)
        .setAudience('raktsetu-api')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 500)
        .sign(secret);

      await expect(verifyAccessToken(expiredToken, cfg)).rejects.toThrow(UnauthorizedError);
      await expect(verifyAccessToken(expiredToken, cfg)).rejects.toThrow(
        /claim timestamp check failed|expired/i
      );
    });

    it('rejects token signed with wrong secret (forged token)', async () => {
      const wrongSecret = new TextEncoder().encode(
        'wrong-attacker-secret-key-that-is-at-least-32-chars!'
      );
      const forgedToken = await new SignJWT({ role: 'admin' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('victim-user')
        .setJti('forged-jti')
        .setIssuer(cfg.JWT_ISSUER)
        .setAudience('raktsetu-api')
        .setExpirationTime('15m')
        .sign(wrongSecret);

      await expect(verifyAccessToken(forgedToken, cfg)).rejects.toThrow(UnauthorizedError);
    });

    it('rejects token with algorithm none (alg: none attack)', async () => {
      // Unsigned token with alg: "none"
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'admin-id',
          role: 'admin',
          jti: 'jti-none',
          iss: cfg.JWT_ISSUER,
          aud: 'raktsetu-api',
          exp: Math.floor(Date.now() / 1000) + 1000
        })
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      await expect(verifyAccessToken(noneToken, cfg)).rejects.toThrow(UnauthorizedError);
    });

    it('rejects token with invalid issuer or audience', async () => {
      const secret = new TextEncoder().encode(cfg.JWT_ACCESS_SECRET);
      const invalidAudienceToken = await new SignJWT({ role: 'donor' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('user-123')
        .setJti('jti-123')
        .setIssuer(cfg.JWT_ISSUER)
        .setAudience('wrong-audience')
        .setExpirationTime('15m')
        .sign(secret);

      await expect(verifyAccessToken(invalidAudienceToken, cfg)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('Opaque Refresh Tokens', () => {
    it('generates 256-bit random opaque tokens and consistent SHA-256 hashes', () => {
      const { rawToken, tokenHash, expiresAt } = generateOpaqueRefreshToken();

      // 32 bytes hex = 64 characters
      expect(rawToken).toHaveLength(64);
      expect(tokenHash).toHaveLength(64);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Hashing the same raw token yields the exact same hash
      expect(hashRefreshToken(rawToken)).toBe(tokenHash);
    });

    it('provides secure cookie options', () => {
      const cookieOptions = getRefreshCookieOptions(cfg);

      expect(cookieOptions.httpOnly).toBe(true);
      expect(cookieOptions.sameSite).toBe('strict');
      expect(cookieOptions.path).toBe('/v1/auth');
      expect(cookieOptions.maxAge).toBe(7 * 24 * 60 * 60);
      expect(REFRESH_COOKIE_NAME).toBe('raktsetu_refresh');
    });
  });
});
