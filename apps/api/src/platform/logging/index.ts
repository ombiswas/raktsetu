import pino, { stdSerializers, stdTimeFunctions } from 'pino';
import { config } from '../config/index.js';

const PII_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'email',
  '*.email',
  'phone',
  '*.phone',
  'phoneNumber',
  '*.phoneNumber',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'latitude',
  '*.latitude',
  'longitude',
  '*.longitude',
  'coordinates',
  '*.coordinates',
  'lat',
  '*.lat',
  'lon',
  '*.lon'
];

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.NODE_ENV === 'production' ? 'info' : 'debug',
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
