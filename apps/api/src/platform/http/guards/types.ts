import type { SafeUser } from '../../../modules/auth/application/auth.service.js';

export type UserRole = 'donor' | 'hospital' | 'blood_bank' | 'admin';

export interface RoutePolicyConfig {
  auth?: boolean;
  roles?: UserRole[];
  isPublic?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SafeUser;
  }
  interface FastifyContextConfig {
    auth?: boolean;
    roles?: UserRole[];
    isPublic?: boolean;
  }
}
