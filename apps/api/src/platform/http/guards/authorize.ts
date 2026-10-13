import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from './types.js';
import { UnauthorizedError, ForbiddenError } from '../errors.js';
import './types.js';

/**
 * Creates an authorization preHandler guard enforcing that the authenticated user possesses one of the allowed roles.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return async function authorizeGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Insufficient permissions. Requires one of: [${allowedRoles.join(', ')}]`
      );
    }
  };
}
