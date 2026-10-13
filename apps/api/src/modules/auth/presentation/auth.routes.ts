import type { FastifyPluginAsync } from 'fastify';
import { AuthService } from '../application/auth.service.js';
import {
  registerDonorSchema,
  registerHospitalSchema,
  registerBloodBankSchema,
  loginSchema,
  type RegisterDonorInput,
  type RegisterHospitalInput,
  type RegisterBloodBankInput,
  type LoginInput
} from '../application/auth.schemas.js';
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions
} from '../domain/tokens.js';
import {
  createAuthenticateGuard,
  authorize,
  createCsrfGuard
} from '../../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../../platform/database/connection.js';
import type { Config } from '../../../platform/config/index.js';
import { UnauthorizedError } from '../../../platform/http/errors.js';

export interface AuthRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  authService?: AuthService;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const authService = options.authService ?? new AuthService(db, config);

  const authenticate = createAuthenticateGuard(db, config);
  const csrfGuard = createCsrfGuard(config);

  // 1. POST /v1/auth/register/donor
  app.post(
    '/register/donor',
    {
      config: { isPublic: true },
      schema: {
        body: registerDonorSchema,
        tags: ['Auth'],
        summary: 'Register a new blood donor'
      }
    },
    async (request, reply) => {
      const result = await authService.registerDonor(request.body as RegisterDonorInput, request.ip);
      return reply.status(201).send({
        message: 'Donor registered successfully',
        user: result.user
      });
    }
  );

  // 2. POST /v1/auth/register/hospital
  app.post(
    '/register/hospital',
    {
      config: { isPublic: true },
      schema: {
        body: registerHospitalSchema,
        tags: ['Auth'],
        summary: 'Register a hospital (pending admin verification)'
      }
    },
    async (request, reply) => {
      const result = await authService.registerHospital(request.body as RegisterHospitalInput, request.ip);
      return reply.status(201).send({
        message: 'Hospital registered successfully. Account is pending approval.',
        user: result.user
      });
    }
  );

  // 3. POST /v1/auth/register/blood-bank
  app.post(
    '/register/blood-bank',
    {
      config: { isPublic: true },
      schema: {
        body: registerBloodBankSchema,
        tags: ['Auth'],
        summary: 'Register a blood bank (pending admin verification)'
      }
    },
    async (request, reply) => {
      const result = await authService.registerBloodBank(request.body as RegisterBloodBankInput, request.ip);
      return reply.status(201).send({
        message: 'Blood bank registered successfully. Account is pending approval.',
        user: result.user
      });
    }
  );

  // 4. POST /v1/auth/login
  app.post(
    '/login',
    {
      config: { isPublic: true },
      schema: {
        body: loginSchema,
        tags: ['Auth'],
        summary: 'Authenticate with email and password'
      }
    },
    async (request, reply) => {
      const userAgent = request.headers['user-agent'];
      const result = await authService.login(request.body as LoginInput, request.ip, userAgent);

      // Set secure HTTP-only refresh cookie
      reply.setCookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions(config)
      );

      return reply.status(200).send({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user
      });
    }
  );

  // 5. POST /v1/auth/refresh
  app.post(
    '/refresh',
    {
      config: { isPublic: true },
      preHandler: [csrfGuard],
      schema: {
        tags: ['Auth'],
        summary: 'Rotate refresh token and issue new access token'
      }
    },
    async (request, reply) => {
      const rawToken =
        request.cookies[REFRESH_COOKIE_NAME] ??
        (request.body as { refreshToken?: string } | undefined)?.refreshToken;

      if (!rawToken) {
        throw new UnauthorizedError('Refresh token required in cookie or body');
      }

      const userAgent = request.headers['user-agent'];
      const result = await authService.refresh(rawToken, request.ip, userAgent);

      // Set rotated refresh cookie
      reply.setCookie(
        REFRESH_COOKIE_NAME,
        result.newRefreshToken,
        getRefreshCookieOptions(config)
      );

      return reply.status(200).send({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn
      });
    }
  );

  // 6. POST /v1/auth/logout
  app.post(
    '/logout',
    {
      config: { isPublic: true },
      preHandler: [csrfGuard],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke session and clear refresh token'
      }
    },
    async (request, reply) => {
      const rawToken = request.cookies[REFRESH_COOKIE_NAME];
      if (rawToken) {
        await authService.logout(rawToken, request.ip);
      }

      reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/v1/auth' });
      return reply.status(200).send({ message: 'Logged out successfully' });
    }
  );

  // 7. GET /v1/auth/me
  app.get(
    '/me',
    {
      config: {
        auth: true,
        roles: ['donor', 'hospital', 'blood_bank', 'admin']
      },
      preHandler: [authenticate, authorize('donor', 'hospital', 'blood_bank', 'admin')],
      schema: {
        tags: ['Auth'],
        summary: 'Get current authenticated user profile'
      }
    },
    async (request, reply) => {
      const user = await authService.getCurrentUser(request.user!.id);
      return reply.status(200).send({ user });
    }
  );
};
