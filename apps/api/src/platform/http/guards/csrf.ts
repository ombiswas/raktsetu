import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Config } from '../../config/index.js';
import { ForbiddenError } from '../errors.js';

/**
 * Enforces CSRF safeguards for sensitive credential endpoints (refresh/logout):
 * 1. Strict POST method requirement
 * 2. Mandatory custom header: X-Requested-With: raktsetu
 * 3. Origin header validation against CORS allow-list (if Origin present)
 */
export function createCsrfGuard(config: Config) {
  return async function csrfGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (request.method !== 'POST') {
      throw new ForbiddenError('Action requires POST method');
    }

    const requestedWith = request.headers['x-requested-with'];
    if (!requestedWith || String(requestedWith).toLowerCase() !== 'raktsetu') {
      throw new ForbiddenError(
        'CSRF protection: request must include header X-Requested-With: raktsetu'
      );
    }

    const origin = request.headers.origin;
    if (origin && !config.CORS_ORIGINS.includes(origin)) {
      throw new ForbiddenError(`CSRF protection: Origin '${origin}' is not permitted`);
    }
  };
}
