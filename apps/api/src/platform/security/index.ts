import type { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import type { Config } from '../config/index.js';

export const AUTH_RATE_LIMIT_POLICY = {
  max: 5,
  timeWindow: '1 minute'
} as const;

export async function registerSecurityPlugins(
  app: FastifyInstance,
  config: Config
): Promise<void> {
  // 1. Helmet: Secure HTTP Headers, removes x-powered-by
  const helmetOptions = config.isProduction
    ? {}
    : { contentSecurityPolicy: false };
  await app.register(fastifyHelmet, helmetOptions);

  // 2. CORS: Strict allow-list from config, never wildcard with credentials
  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile native, cURL, or server-to-server)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (config.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      // Reject unknown origins strictly
      callback(new Error(`Origin '${origin}' not permitted by CORS policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
  });

  // 3. Global Rate Limiter
  await app.register(fastifyRateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute'
  });
}
