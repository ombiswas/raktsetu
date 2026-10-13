import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCookie from '@fastify/cookie';
import type pg from 'pg';
import { type Config, config as defaultPlatformConfig } from './platform/config/index.js';
import { createLogger, resolveRequestId } from './platform/logging/index.js';
import {
  createErrorHandler,
  createNotFoundHandler,
  healthRoutes,
  RouteRegistry,
  registerRouteRegistry
} from './platform/http/index.js';
import { registerSecurityPlugins } from './platform/security/index.js';
import {
  createDbPool,
  createDrizzle,
  type DatabaseInstance
} from './platform/database/connection.js';
import { authRoutes } from './modules/auth/presentation/auth.routes.js';
import { donorRoutes } from './modules/donors/index.js';
import { hospitalRoutes } from './modules/hospitals/index.js';
import { bloodBankRoutes } from './modules/blood-banks/index.js';
import { adminRoutes } from './modules/admin/index.js';
import { bloodRequestsRoutes } from './modules/blood-requests/index.js';

export interface AppDependencies {
  config?: Config;
  logger?: FastifyBaseLogger;
  checkDatabase?: () => Promise<boolean>;
  db?: DatabaseInstance;
  routeRegistry?: RouteRegistry;
}

export async function buildApp(deps: Partial<AppDependencies> = {}): Promise<FastifyInstance> {
  const cfg = deps.config ?? defaultPlatformConfig;
  const appLogger = deps.logger ?? createLogger(cfg);

  let ownPool: pg.Pool | null = null;
  let dbInstance = deps.db;

  if (!dbInstance) {
    ownPool = createDbPool(cfg);
    dbInstance = createDrizzle(ownPool);
  }

  const app = Fastify({
    loggerInstance: appLogger,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
    bodyLimit: 100 * 1024, // 100kb payload limit
    trustProxy: cfg.TRUST_PROXY
  }).withTypeProvider<ZodTypeProvider>();

  // Clean up internally allocated pool on app close
  if (ownPool) {
    app.addHook('onClose', async () => {
      await ownPool?.end();
    });
  }

  // Register Zod schema compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Cookie plugin
  await app.register(fastifyCookie, {
    secret: cfg.COOKIE_SECRET
  });

  // Uniform error handling & 404
  app.setErrorHandler(createErrorHandler());
  app.setNotFoundHandler(createNotFoundHandler());

  // Security plugins: Helmet, CORS, Rate Limit
  await registerSecurityPlugins(app, cfg);

  // Track route policies and enforce deny-by-default
  const registry = deps.routeRegistry ?? new RouteRegistry();
  registerRouteRegistry(app, registry);
  app.decorate('routeRegistry', registry);

  // OpenAPI generation with Swagger
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'RaktSetu API (रक्तसेतु)',
        description:
          'AI-assisted, geospatially aware emergency blood-donor prioritization prototype API. All outputs designate SIMULATION.',
        version: '0.1.0'
      },
      servers: [
        {
          url: `http://${cfg.HOST}:${cfg.PORT}`,
          description: 'RaktSetu API Server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    },
    transform: jsonSchemaTransform
  });

  // Serve Swagger UI documentation strictly in non-production environments
  if (!cfg.isProduction) {
    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      }
    });
  }

  // Health and Readiness probes
  await app.register(healthRoutes, {
    prefix: '/health',
    checkDatabase: deps.checkDatabase
  });

  // Auth Module routes
  await app.register(authRoutes, {
    prefix: '/v1/auth',
    db: dbInstance,
    config: cfg
  });

  // Donor Module routes
  await app.register(donorRoutes, {
    prefix: '/v1/donors',
    db: dbInstance,
    config: cfg
  });

  // Hospital Module routes
  await app.register(hospitalRoutes, {
    prefix: '/v1/hospitals',
    db: dbInstance,
    config: cfg
  });

  // Blood Bank Module routes
  await app.register(bloodBankRoutes, {
    prefix: '/v1/blood-banks',
    db: dbInstance,
    config: cfg
  });

  // Admin Module routes
  await app.register(adminRoutes, {
    prefix: '/v1/admin',
    db: dbInstance,
    config: cfg
  });

  // Blood Requests Module routes
  await app.register(bloodRequestsRoutes, {
    prefix: '/v1/requests',
    db: dbInstance,
    config: cfg
  });

  return app;
}
