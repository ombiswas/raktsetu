import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UpstreamError
} from '../../../src/platform/http/errors.js';
import { createConfig } from '../../../src/platform/config/index.js';

describe('platform/http: Error Handling, Uniform Response Shapes & Health Probes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const testConfig = createConfig({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:5173'
    });

    app = await buildApp({
      config: testConfig,
      checkDatabase: async () => true
    });

    // Register routes that deliberately throw to test central error handling
    app.get('/test/validation-error', async () => {
      throw new ValidationError('Email format is invalid', [
        { field: 'email', reason: 'Must be a valid email format' }
      ]);
    });

    app.get('/test/unauthorized-error', async () => {
      throw new UnauthorizedError('Session expired');
    });

    app.get('/test/forbidden-error', async () => {
      throw new ForbiddenError('Insufficient permissions for resource');
    });

    app.get('/test/conflict-error', async () => {
      throw new ConflictError('Record already exists');
    });

    app.get('/test/upstream-error', async () => {
      throw new UpstreamError('ML inference gateway unreachable');
    });

    app.get('/test/internal-error', async () => {
      throw new Error('Database password leak: secret-db-1234');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Probes', () => {
    it('GET /health/live returns 200 with uptime and timestamp', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('ok');
      expect(typeof body.uptime).toBe('number');
      expect(typeof body.timestamp).toBe('string');
    });

    it('GET /health/ready returns 200 when database connectivity succeeds', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('ready');
      expect(body.database).toBe('connected');
    });

    it('GET /health/ready returns 503 when database connectivity fails', async () => {
      const failingApp = await buildApp({
        config: createConfig({ NODE_ENV: 'test' }),
        checkDatabase: async () => {
          throw new Error('Connection refused at port 5432');
        }
      });
      await failingApp.ready();

      const res = await failingApp.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('unhealthy');
      expect(body.database).toBe('disconnected');

      await failingApp.close();
    });
  });

  describe('Uniform Error Response Model', () => {
    it('returns uniform shape with details for ValidationError', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/validation-error',
        headers: {
          'x-request-id': 'req-test-validation-1234'
        }
      });

      expect(res.statusCode).toBe(400);
      expect(res.headers['x-request-id']).toBe('req-test-validation-1234');

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email format is invalid',
          requestId: 'req-test-validation-1234',
          details: [{ field: 'email', reason: 'Must be a valid email format' }]
        }
      });
      expect(body.error.stack).toBeUndefined();
    });

    it('returns uniform shape without details for UnauthorizedError', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/unauthorized-error'
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Session expired');
      expect(body.error.requestId).toBeDefined();
      expect(body.error.details).toBeUndefined();
      expect(body.error.stack).toBeUndefined();
    });

    it('returns uniform shape without details for ForbiddenError', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/forbidden-error'
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Insufficient permissions for resource');
    });

    it('returns uniform shape without details for ConflictError', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/conflict-error'
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Record already exists');
    });

    it('returns uniform shape without details for UpstreamError', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/upstream-error'
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('UPSTREAM_ERROR');
      expect(body.error.message).toBe('ML inference gateway unreachable');
    });

    it('sanitizes unexpected 500 errors and never exposes internal message or stack trace', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/internal-error'
      });

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.error.message).toBe('An unexpected internal error occurred');
      expect(body.error.requestId).toBeDefined();

      // Must NEVER leak the internal error message or stack trace
      expect(res.payload).not.toContain('secret-db-1234');
      expect(res.payload).not.toContain('Database password leak');
      expect(body.error.stack).toBeUndefined();
    });

    it('404 Not Found returns uniform shape with requestId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/unknown-route-endpoint',
        headers: {
          'x-request-id': 'req-not-found-trace-123'
        }
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers['x-request-id']).toBe('req-not-found-trace-123');

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Route GET /unknown-route-endpoint not found',
          requestId: 'req-not-found-trace-123'
        }
      });
    });
  });
});
