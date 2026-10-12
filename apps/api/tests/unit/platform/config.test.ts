import { describe, it, expect } from 'vitest';
import { createConfig } from '../../../src/platform/config/index.js';

describe('platform/config: Configuration Validation & Security', () => {
  it('loads valid configuration with development defaults', () => {
    const config = createConfig({
      NODE_ENV: 'development'
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.CORS_ORIGINS).toContain('http://localhost:5173');
    expect(config.JWT_ISSUER).toBe('raktsetu-api');
    expect(config.cookieSecureResolved).toBe(false);
    expect(config.logLevelResolved).toBe('debug');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('fails fast on invalid PORT or URL with clean error message', () => {
    expect(() =>
      createConfig({
        PORT: 'not-a-port',
        ML_SERVICE_URL: 'invalid-url'
      })
    ).toThrowError(/Configuration validation failed:/);
  });

  it('never prints secret values in error messages when validation fails', () => {
    const sensitiveValue = 'SUPER_SECRET_LEAKY_VALUE_12345';
    let errorMessage = '';

    try {
      createConfig({
        // Too short for secret (< 32 chars)
        JWT_ACCESS_SECRET: sensitiveValue.slice(0, 10),
        PORT: 'invalid'
      });
    } catch (err) {
      errorMessage = (err as Error).message;
    }

    expect(errorMessage).toContain('JWT_ACCESS_SECRET');
    expect(errorMessage).toContain('JWT_ACCESS_SECRET must be at least 32 characters');
    // Crucial check: the actual raw input value must NEVER be printed
    expect(errorMessage).not.toContain(sensitiveValue);
    expect(errorMessage).not.toContain(sensitiveValue.slice(0, 10));
  });

  it('fails in production if default development secrets are used', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'production'
      })
    ).toThrowError(/Must provide a secure non-default JWT_ACCESS_SECRET in production/);
  });

  it('accepts custom production configuration when all secrets are secure', () => {
    const prodConfig = createConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgres://production_user:securepassword@prod-db.internal:5432/raktsetu',
      JWT_ACCESS_SECRET: 'a-very-secure-production-jwt-secret-key-32-chars!',
      COOKIE_SECRET: 'a-very-secure-production-cookie-secret-key-32!',
      CORS_ORIGINS: 'https://raktsetu.org,https://admin.raktsetu.org',
      ML_SERVICE_URL: 'https://ml.raktsetu.internal:8000'
    });

    expect(prodConfig.isProduction).toBe(true);
    expect(prodConfig.PORT).toBe(8080);
    expect(prodConfig.cookieSecureResolved).toBe(true);
    expect(prodConfig.logLevelResolved).toBe('info');
    expect(prodConfig.CORS_ORIGINS).toEqual([
      'https://raktsetu.org',
      'https://admin.raktsetu.org'
    ]);
  });
});
