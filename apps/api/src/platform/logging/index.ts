import crypto from 'node:crypto';
import pino, { type Logger, stdSerializers, stdTimeFunctions } from 'pino';
import { type Config, config as defaultPlatformConfig } from '../config/index.js';

export const PII_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'email',
  '*.email',
  'phone',
  '*.phone',
  'phoneNumber',
  '*.phoneNumber',
  'latitude',
  '*.latitude',
  'longitude',
  '*.longitude',
  'location',
  '*.location',
  'lat',
  '*.lat',
  'lon',
  '*.lon'
];

const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-.]{8,128}$/;

/**
 * Resolves a request ID: verifies valid format from inbound header,
 * or generates a fresh cryptographically random UUID.
 */
export function resolveRequestId(inboundId?: string | string[]): string {
  if (Array.isArray(inboundId)) {
    inboundId = inboundId[0];
  }
  if (typeof inboundId === 'string' && VALID_REQUEST_ID_REGEX.test(inboundId)) {
    return inboundId;
  }
  return crypto.randomUUID();
}

/**
 * Creates a configured Pino logger instance with strict PII redaction.
 */
export function createLogger(cfg: Config = defaultPlatformConfig): Logger {
  return pino({
    level: cfg.logLevelResolved,
    redact: {
      paths: PII_REDACT_PATHS,
      censor: '[REDACTED]'
    },
    serializers: {
      err: stdSerializers.err,
      req: stdSerializers.req,
      res: stdSerializers.res
    },
    timestamp: stdTimeFunctions.isoTime
  });
}

export const logger = createLogger(defaultPlatformConfig);
