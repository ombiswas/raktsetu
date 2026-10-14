import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpMlClient } from '../ml-client.js';
import type { PredictBatchRequest } from '../../application/response-predictor.interface.js';

describe('HttpMlClient (ResponsePredictor)', () => {
  const sampleRequest: PredictBatchRequest = {
    requestId: '99999999-9999-9999-9999-999999999999',
    candidates: [
      {
        donorId: 'd-1',
        distanceKm: 3.5,
        age: 28,
        hourOfDay: 14,
        urgency: 'CRITICAL',
        isWeekend: false,
        priorResponseRate: 0.65,
        totalPastDonations: 4,
        daysSinceLastDonation: 110,
        nightFlag: 0
      }
    ]
  };

  const validResponsePayload = {
    request_id: '99999999-9999-9999-9999-999999999999',
    predictions: [
      {
        donor_id: 'd-1',
        probability: 0.82,
        model_version: 'v1.0.0-xgb',
        is_simulation: false
      }
    ],
    model_version: 'v1.0.0-xgb',
    timestamp: '2026-10-14T05:00:00Z',
    disclaimer: 'Prototype research model'
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('successfully fetches and validates predictions with Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validResponsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    globalThis.fetch = fetchMock;

    const client = new HttpMlClient({
      baseUrl: 'http://ml-service.local:8000',
      token: 'test-secret-bearer-token',
      timeoutMs: 800
    });

    const result = await client.predictBatch(sampleRequest);

    expect(result.isAvailable).toBe(true);
    if (result.isAvailable) {
      expect(result.modelVersion).toBe('v1.0.0-xgb');
      expect(result.predictions.get('d-1')).toBe(0.82);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ml-service.local:8000/v1/predict/response');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer test-secret-bearer-token'
    );
  });

  it('returns typed unavailable when ML service responds with 500 error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Internal ML server error' }), {
        status: 500
      })
    );

    const client = new HttpMlClient({
      baseUrl: 'http://ml-service.local:8000',
      timeoutMs: 800
    });

    const result = await client.predictBatch(sampleRequest);

    expect(result.isAvailable).toBe(false);
    if (!result.isAvailable) {
      expect(result.reason).toContain('HTTP status 500');
    }
  });

  it('returns typed unavailable when request times out (> 800ms)', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const err = new Error('The operation was aborted');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    });

    const client = new HttpMlClient({
      baseUrl: 'http://ml-service.local:8000',
      timeoutMs: 800
    });

    const result = await client.predictBatch(sampleRequest);

    expect(result.isAvailable).toBe(false);
    if (!result.isAvailable) {
      expect(result.reason).toContain('timed out');
    }
  });

  it('returns typed unavailable when Zod validation fails (e.g. probability out of range)', async () => {
    const invalidPayload = {
      ...validResponsePayload,
      predictions: [
        {
          donor_id: 'd-1',
          probability: 1.75 // invalid: > 1
        }
      ]
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(invalidPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const client = new HttpMlClient({
      baseUrl: 'http://ml-service.local:8000',
      timeoutMs: 800
    });

    const result = await client.predictBatch(sampleRequest);

    expect(result.isAvailable).toBe(false);
    if (!result.isAvailable) {
      expect(result.reason).toContain('Malformed ML response');
    }
  });

  it('circuit breaker opens after N failures and fails fast without calling fetch', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network connection refused'));
    globalThis.fetch = fetchMock;

    const client = new HttpMlClient({
      baseUrl: 'http://ml-service.local:8000',
      failureThreshold: 3,
      resetTimeoutMs: 5000
    });

    // 1st failure
    await client.predictBatch(sampleRequest);
    expect(client.getCircuitState()).toBe('CLOSED');
    expect(client.getFailureCount()).toBe(1);

    // 2nd failure
    await client.predictBatch(sampleRequest);
    expect(client.getCircuitState()).toBe('CLOSED');
    expect(client.getFailureCount()).toBe(2);

    // 3rd failure -> trips breaker to OPEN
    await client.predictBatch(sampleRequest);
    expect(client.getCircuitState()).toBe('OPEN');
    expect(client.getFailureCount()).toBe(3);

    // 4th call when OPEN: fails fast, does NOT call fetch again!
    const result = await client.predictBatch(sampleRequest);
    expect(result.isAvailable).toBe(false);
    if (!result.isAvailable) {
      expect(result.circuitOpen).toBe(true);
      expect(result.reason).toContain('Circuit breaker is OPEN');
    }
    expect(fetchMock).toHaveBeenCalledTimes(3); // Not 4!
  });

  it('transitions to HALF_OPEN after resetTimeoutMs and closes upon successful probe', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection failure'));
    globalThis.fetch = fetchMock;

    const client = new HttpMlClient({
      baseUrl: 'http://ml-service.local:8000',
      failureThreshold: 2,
      resetTimeoutMs: 5000
    });

    // Trip circuit
    await client.predictBatch(sampleRequest);
    await client.predictBatch(sampleRequest);
    expect(client.getCircuitState()).toBe('OPEN');

    // Advance time beyond resetTimeoutMs
    vi.advanceTimersByTime(5100);

    // Circuit is now HALF_OPEN
    expect(client.getCircuitState()).toBe('HALF_OPEN');

    // Make probe call succeed
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(validResponsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const probeResult = await client.predictBatch(sampleRequest);
    expect(probeResult.isAvailable).toBe(true);
    expect(client.getCircuitState()).toBe('CLOSED');
    expect(client.getFailureCount()).toBe(0);
  });
});
