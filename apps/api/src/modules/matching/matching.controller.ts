/**
 * Matching Controller
 * Parses request parameters and delegates to MatchingService. Zero business logic.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MatchingService } from './matching.service.js';
import type { MatchingParams } from './matching.schema.js';
import { UnauthorizedError } from '../../platform/http/errors.js';

export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  public getStatus = async (
    req: FastifyRequest<{ Params: MatchingParams }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication required to inspect matching candidate records');
    }

    const { id: requestId } = req.params;

    const statusView = await this.matchingService.getMatchingStatus(requestId, {
      id: user.id,
      role: user.role
    });

    await reply.status(200).send(statusView);
  };
}
