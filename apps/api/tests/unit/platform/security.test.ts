import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { buildApp } from '../../../src/app.js';
import { createConfig } from '../../../src/platform/config/index.js';
import { registerSecurityPlugins } from '../../../src/platform/security/index.js';
import { createErrorHandler } from '../../../src/platform/http/error-handler.js';

describe('platform/security: CORS, Rate Limiting, Helmet, and Body Limits', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = createConfig({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:5173,https://raktsetu.org'
    });

    app = await buildApp({ config });

    // Dummy endpoint for testing POST payloads
    app.post('/test/echo', async (req) => {
      return { received: req.body };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CORS Strict Allow-List', () => {
    it('permits whitelisted origin with credentials header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: {
          origin: 'http://localhost:5173'
        }
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects unlisted origin and does not grant access-control-allow-origin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: {
          origin: 'http://malicious-site.example.com'
        }
      });

      // Under our strict CORS policy, unlisted origins do not get allow-origin header
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Security Headers & X-Powered-By', () => {
    it('disables x-powered-by header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Payload Body Size Limit (100kb)', () => {
    it('rejects request body exceeding 100kb with status 413', async () => {
      // 105kb of data
      const oversizedPayload = {
        data: 'a'.repeat(105 * 1024)
      };

      const res = await app.inject({
        method: 'POST',
        url: '/test/echo',
        payload: oversizedPayload
      });

      expect(res.statusCode).toBe(413);
    });

    it('accepts payload within 100kb limit', async () => {
      const normalPayload = {
        data: 'a'.repeat(5 * 1024)
      };

      const res = await app.inject({
        method: 'POST',
        url: '/test/echo',
        payload: normalPayload
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Rate Limiter', () => {
    it('triggers 429 when rate limit threshold is exceeded', async () => {
      // Create isolated app instance with very tight rate limit to test triggering
      const rateLimitApp = Fastify();
      const tightConfig = createConfig({
        NODE_ENV: 'test',
        CORS_ORIGINS: 'http://localhost:5173'
      });

      rateLimitApp.setErrorHandler(createErrorHandler());
      await registerSecurityPlugins(rateLimitApp, tightConfig);

      rateLimitApp.get('/test/limited', {
        config: {
          rateLimit: {
            max: 2,
            timeWindow: '1 minute'
          }
        }
      }, async () => ({ status: 'ok' }));

      await rateLimitApp.ready();

      // Request 1: success
      const res1 = await rateLimitApp.inject({ method: 'GET', url: '/test/limited' });
      expect(res1.statusCode).toBe(200);

      // Request 2: success
      const res2 = await rateLimitApp.inject({ method: 'GET', url: '/test/limited' });
      expect(res2.statusCode).toBe(200);

      // Request 3: rate limit exceeded
      const res3 = await rateLimitApp.inject({ method: 'GET', url: '/test/limited' });
      expect(res3.statusCode).toBe(429);

      const body = JSON.parse(res3.payload);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.message).toContain('Rate limit exceeded');

      await rateLimitApp.close();
    });
  });
});
