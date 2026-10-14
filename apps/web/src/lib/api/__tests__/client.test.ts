import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, isSameOrigin } from '../client.js';
import { getAccessToken, setAccessToken, clearAccessToken } from '../token-store.js';
import { ApiError } from '../errors.js';

describe('API Client (apiFetch, in-memory tokens, silent refresh)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('isSameOrigin utility', () => {
    it('returns true for relative paths', () => {
      expect(isSameOrigin('/api/v1/requests')).toBe(true);
      expect(isSameOrigin('/health')).toBe(true);
    });

    it('returns true for same origin absolute URL', () => {
      expect(isSameOrigin(window.location.origin + '/api/v1')).toBe(true);
    });

    it('returns false for protocol-relative and external domains', () => {
      expect(isSameOrigin('//evil.com/api')).toBe(false);
      expect(isSameOrigin('https://thirdparty.com/api')).toBe(false);
    });
  });

  describe('Authorization Header & Same-Origin Isolation', () => {
    it('attaches in-memory bearer token when present', async () => {
      setAccessToken('test-token-jwt-123');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' })
      });
      global.fetch = mockFetch;

      await apiFetch('/api/v1/donors/profile');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/v1/donors/profile');
      expect((init.headers as Headers).get('Authorization')).toBe('Bearer test-token-jwt-123');
      expect(init.credentials).toBe('include');
      expect((init.headers as Headers).get('X-Requested-With')).toBe('raktsetu');
    });

    it('omits credentials on external cross-origin requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ tiles: 'ok' })
      });
      global.fetch = mockFetch;

      await apiFetch('https://cartocdn.com/tiles/1/2/3.png');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.credentials).toBe('omit');
      expect((init.headers as Headers).get('X-Requested-With')).toBeNull();
    });
  });

  describe('Silent 401 Refresh & Retry Loop', () => {
    it('triggers silent refresh on 401 and retries original call with new token', async () => {
      setAccessToken('expired-token');

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/v1/requests' && callCount === 0) {
          callCount++;
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: { code: 'UNAUTHORIZED', message: 'Token expired', requestId: 'req-1' }
            })
          });
        }

        if (url === '/api/v1/auth/refresh') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ accessToken: 'brand-new-refreshed-token' })
          });
        }

        if (url === '/api/v1/requests' && callCount === 1) {
          callCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ requests: [{ id: 'req-001' }] })
          });
        }

        return Promise.reject(new Error(`Unexpected url: ${url}`));
      });

      const result = await apiFetch<{ requests: { id: string }[] }>('/api/v1/requests');

      expect(result.requests).toHaveLength(1);
      expect(getAccessToken()).toBe('brand-new-refreshed-token');
      expect(callCount).toBe(2);
    });

    it('clears token and throws ApiError if refresh fails', async () => {
      setAccessToken('expired-token');

      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/v1/requests') {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: { code: 'UNAUTHORIZED', message: 'Token expired', requestId: 'req-1' }
            })
          });
        }

        if (url === '/api/v1/auth/refresh') {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: { code: 'REFRESH_REVOKED', message: 'Session expired', requestId: 'req-2' }
            })
          });
        }

        return Promise.reject(new Error('Unexpected fetch call'));
      });

      await expect(apiFetch('/api/v1/requests')).rejects.toThrow(ApiError);
      expect(getAccessToken()).toBeNull();
    });
  });

  describe('Uniform Error Normalization', () => {
    it('normalizes uniform error response from API into strongly-typed ApiError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        headers: new Headers({
          'content-type': 'application/json',
          'x-request-id': 'req-xyz-99'
        }),
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid blood group code',
            requestId: 'req-xyz-99',
            details: [{ field: 'bloodGroup', issue: 'invalid_enum' }]
          }
        })
      });

      try {
        await apiFetch('/api/v1/requests');
        expect.unreachable('Should have thrown ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.code).toBe('VALIDATION_ERROR');
        expect(apiErr.message).toBe('Invalid blood group code');
        expect(apiErr.requestId).toBe('req-xyz-99');
        expect(apiErr.details).toEqual([{ field: 'bloodGroup', issue: 'invalid_enum' }]);
      }
    });
  });
});
