import crypto from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Config } from '../../../platform/config/index.js';
import { UnauthorizedError } from '../../../platform/http/errors.js';

export const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
export const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 900 seconds
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;
export const REFRESH_COOKIE_NAME = 'raktsetu_refresh';

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  role: string;
  jti: string;
}

export interface VerifiedAccessToken {
  userId: string;
  role: string;
  jti: string;
}

export interface GeneratedRefreshToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Returns the secret key buffer for HMAC-SHA256 JWT signing and verification.
 */
function getJwtSecret(cfg: Config): Uint8Array {
  return new TextEncoder().encode(cfg.JWT_ACCESS_SECRET);
}

/**
 * Generates a signed Access JWT containing sub, role, jti, iss, and aud.
 */
export async function createAccessToken(
  userId: string,
  role: string,
  cfg: Config
): Promise<string> {
  const secret = getJwtSecret(cfg);
  const jti = crypto.randomUUID();

  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuer(cfg.JWT_ISSUER)
    .setAudience('raktsetu-api')
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secret);
}

/**
 * Verifies an Access JWT strictly against expected HS256 algorithm, issuer, and audience.
 * Throws UnauthorizedError on expired, forged, or alg-none tokens.
 */
export async function verifyAccessToken(
  token: string,
  cfg: Config
): Promise<VerifiedAccessToken> {
  try {
    const secret = getJwtSecret(cfg);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: cfg.JWT_ISSUER,
      audience: 'raktsetu-api'
    });

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedError('Token is missing valid subject claim');
    }

    if (!payload['role'] || typeof payload['role'] !== 'string') {
      throw new UnauthorizedError('Token is missing valid role claim');
    }

    if (!payload.jti || typeof payload.jti !== 'string') {
      throw new UnauthorizedError('Token is missing valid jti claim');
    }

    return {
      userId: payload.sub,
      role: payload['role'] as string,
      jti: payload.jti
    };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Invalid or expired access token';
    throw new UnauthorizedError(`Authentication failed: ${message}`);
  }
}

/**
 * Generates a 256-bit random opaque refresh token and its SHA-256 hash.
 */
export function generateOpaqueRefreshToken(): GeneratedRefreshToken {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  return {
    rawToken,
    tokenHash,
    expiresAt
  };
}

/**
 * Computes the SHA-256 hash of an opaque refresh token for safe storage and lookup.
 */
export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Returns Fastify cookie options for setting the secure refresh token cookie.
 */
export function getRefreshCookieOptions(cfg: Config) {
  return {
    httpOnly: true,
    secure: cfg.cookieSecureResolved,
    sameSite: 'strict' as const,
    path: '/v1/auth',
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60
  };
}
