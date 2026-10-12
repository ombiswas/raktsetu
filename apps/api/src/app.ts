import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { type Config, config as defaultPlatformConfig } from './platform/config/index.js';
import { createLogger, resolveRequestId } from './platform/logging/index.js';
import {
  createErrorHandler,
  createNotFoundHandler,
  healthRoutes
} from './platform/http/index.js';
import { registerSecurityPlugins } from './platform/security/index.js';

export interface AppDependencies {
  config?: Config;
  logger?: FastifyBaseLogger;
  checkDatabase?: () => Promise<boolean>;
}

export async function buildApp(deps: Partial<AppDependencies> = {}): Promise<FastifyInstance> {
  const cfg = deps.config ?? defaultPlatformConfig;
  const appLogger = deps.logger ?? createLogger(cfg);

  const app = Fastify({
    loggerInstance: appLogger,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
    bodyLimit: 100 * 1024, // 100kb payload limit
    trustProxy: cfg.TRUST_PROXY
  }).withTypeProvider<ZodTypeProvider>();

  // Register Zod schema compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Uniform error handling & 404
  app.setErrorHandler(createErrorHandler());
  app.setNotFoundHandler(createNotFoundHandler());

  // Security plugins: Helmet, CORS, Rate Limit
  await registerSecurityPlugins(app, cfg);

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

  return app;
}
