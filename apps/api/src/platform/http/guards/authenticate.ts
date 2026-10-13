import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../../database/connection.js';
import type { Config } from '../../config/index.js';
import { users } from '../../database/schema.js';
import { verifyAccessToken } from '../../../modules/auth/domain/tokens.js';
import { sanitizeUser } from '../../../modules/auth/application/auth.service.js';
import { UnauthorizedError } from '../errors.js';
import './types.js';

export function createAuthenticateGuard(db: DatabaseInstance, config: Config) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError('Authorization token required');
    }

    const verified = await verifyAccessToken(token, config);

    // Verify user exists and status is active
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, verified.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('User account is not active');
    }

    request.user = sanitizeUser(user);
  };
}
