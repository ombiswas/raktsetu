import { z } from 'zod';

const DEFAULT_DEV_JWT_SECRET = 'dev-super-secret-jwt-key-minimum-32-chars-long!';
const DEFAULT_DEV_COOKIE_SECRET = 'dev-super-secret-cookie-key-minimum-32-chars!';
const DEFAULT_DEV_DB_URL = 'postgres://postgres:postgrespassword@localhost:5432/raktsetu';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1).default(DEFAULT_DEV_DB_URL),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
      .default(DEFAULT_DEV_JWT_SECRET),
    JWT_ISSUER: z.string().default('raktsetu-api'),
    COOKIE_SECRET: z
      .string()
      .min(32, 'COOKIE_SECRET must be at least 32 characters')
      .default(DEFAULT_DEV_COOKIE_SECRET),
    COOKIE_SECURE: z
      .preprocess((val) => {
        if (typeof val === 'string') {
          if (val.toLowerCase() === 'true' || val === '1') return true;
          if (val.toLowerCase() === 'false' || val === '0') return false;
        }
        return val;
      }, z.boolean())
      .optional(),
    COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
    COOKIE_DOMAIN: z.string().optional(),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://localhost:3000')
      .transform((val) =>
        val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
    ML_SERVICE_TOKEN: z.string().optional(),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:admin@raktsetu.internal'),
    MATCHING_ALGORITHM: z.enum(['baseline', 'hybrid']).default('hybrid'),
    MATCHING_BATCH_SIZE: z.coerce.number().int().positive().default(5),
    MATCHING_BATCH_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
    EMAIL_PROVIDER: z.enum(['mock', 'resend', 'brevo']).default('mock'),
    EMAIL_API_KEY: z.string().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),
    TRUST_PROXY: z
      .preprocess((val) => {
        if (typeof val === 'string') {
          if (val.toLowerCase() === 'true' || val === '1') return true;
          if (val.toLowerCase() === 'false' || val === '0') return false;
        }
        return val;
      }, z.boolean())
      .default(false)
  })
  .superRefine((data, ctx) => {
    // In production, forbid using the default dev secrets
    if (data.NODE_ENV === 'production') {
      if (data.JWT_ACCESS_SECRET === DEFAULT_DEV_JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'Must provide a secure non-default JWT_ACCESS_SECRET in production'
        });
      }
      if (data.COOKIE_SECRET === DEFAULT_DEV_COOKIE_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECRET'],
          message: 'Must provide a secure non-default COOKIE_SECRET in production'
        });
      }
      if (data.DATABASE_URL === DEFAULT_DEV_DB_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'Must provide production DATABASE_URL'
        });
      }
    }
  });

export type RawConfig = z.infer<typeof envSchema>;

export interface Config extends RawConfig {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly cookieSecureResolved: boolean;
  readonly logLevelResolved: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}

/**
 * Formats Zod errors clearly without printing raw secret values.
 */
export function formatConfigError(error: z.ZodError): string {
  const issues = error.issues.map((i) => {
    const path = i.path.join('.') || 'root';
    return `  - ${path}: ${i.message}`;
  });
  return `Configuration validation failed:\n${issues.join('\n')}`;
}

/**
 * Creates and freezes a verified Config object from environment variables.
 * Fails fast with a clean error message that never leaks secrets.
 */
export function createConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const formatted = formatConfigError(result.error);
    throw new Error(formatted);
  }

  const raw = result.data;
  const isProduction = raw.NODE_ENV === 'production';
  const isDevelopment = raw.NODE_ENV === 'development';
  const isTest = raw.NODE_ENV === 'test';

  const cookieSecureResolved = raw.COOKIE_SECURE ?? isProduction;
  const logLevelResolved =
    raw.LOG_LEVEL ?? (isTest ? 'silent' : isProduction ? 'info' : 'debug');

  const resolvedConfig: Config = {
    ...raw,
    isProduction,
    isDevelopment,
    isTest,
    cookieSecureResolved,
    logLevelResolved
  };

  return Object.freeze(resolvedConfig);
}

export const config: Config = createConfig(process.env);
