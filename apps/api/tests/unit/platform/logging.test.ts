import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { resolveRequestId, PII_REDACT_PATHS } from '../../../src/platform/logging/index.js';

describe('platform/logging: Structured Logging, Request-ID, and PII Redaction', () => {
  describe('resolveRequestId', () => {
    it('accepts and preserves valid inbound request ID', () => {
      const validId = 'req-client-trace-12345678';
      expect(resolveRequestId(validId)).toBe(validId);
    });

    it('accepts array header and extracts first valid element', () => {
      const headerList = ['req-client-valid-123456', 'other-id'];
      expect(resolveRequestId(headerList)).toBe('req-client-valid-123456');
    });

    it('generates a new UUID when inbound ID is missing', () => {
      const generated = resolveRequestId(undefined);
      expect(generated).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('generates a new UUID when inbound ID contains invalid / dangerous characters', () => {
      const malformedId = '<script>alert(1)</script>';
      const generated = resolveRequestId(malformedId);
      expect(generated).not.toBe(malformedId);
      expect(generated).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('Pino PII Redaction', () => {
    it('redacts sensitive fields and guarantees no credentials or coordinates leak', () => {
      const loggedMessages: string[] = [];

      // Create test logger writing to array destination
      const testStream = {
        write: (msg: string) => {
          loggedMessages.push(msg);
        }
      };

      const testLogger = pino(
        {
          level: 'info',
          redact: {
            paths: PII_REDACT_PATHS,
            censor: '[REDACTED]'
          }
        },
        testStream
      );

      const sensitivePayload = {
        authorization: 'Bearer secret-jwt-token-123',
        password: 'UserPlainTextPassword123!',
        token: 'refresh-token-xyz',
        email: 'private.donor@example.com',
        phone: '+919988776655',
        latitude: 28.6139,
        longitude: 77.2090,
        location: {
          lat: 28.6139,
          lon: 77.209
        },
        safeField: 'harmless-public-data'
      };

      testLogger.info(sensitivePayload, 'Processed sensitive transaction');

      expect(loggedMessages.length).toBe(1);
      const logLine = loggedMessages[0]!;

      // Parse JSON log
      const parsed = JSON.parse(logLine);

      // Verify redaction applied
      expect(parsed.authorization).toBe('[REDACTED]');
      expect(parsed.password).toBe('[REDACTED]');
      expect(parsed.token).toBe('[REDACTED]');
      expect(parsed.email).toBe('[REDACTED]');
      expect(parsed.phone).toBe('[REDACTED]');
      expect(parsed.latitude).toBe('[REDACTED]');
      expect(parsed.longitude).toBe('[REDACTED]');
      expect(parsed.location).toBe('[REDACTED]');
      expect(parsed.safeField).toBe('harmless-public-data');

      // Crucial: assert the raw sensitive strings DO NOT exist in the serialized text
      expect(logLine).not.toContain('UserPlainTextPassword123!');
      expect(logLine).not.toContain('Bearer secret-jwt-token-123');
      expect(logLine).not.toContain('private.donor@example.com');
      expect(logLine).not.toContain('+919988776655');
    });
  });
});
