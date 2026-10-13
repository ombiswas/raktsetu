/**
 * RequestCreated Event Subscriber
 * Automatically triggers baseline match run execution upon new emergency blood request creation.
 */

import type { IRequestEventBus, RequestCreatedEvent } from '../../blood-requests/domain/events.js';
import type { CreateMatchRunUseCase } from './create-match-run.usecase.js';
import type { FastifyBaseLogger } from 'fastify';

export function registerRequestCreatedMatchingSubscriber(
  eventBus: IRequestEventBus,
  useCase: CreateMatchRunUseCase,
  logger?: FastifyBaseLogger
): () => void {
  return eventBus.subscribe('RequestCreated', async (event: RequestCreatedEvent) => {
    try {
      if (logger) {
        logger.info(
          { requestId: event.payload.requestId },
          'RequestCreated event received; initiating baseline matching run'
        );
      }
      await useCase.execute({ requestId: event.payload.requestId });
    } catch (err: unknown) {
      if (logger) {
        logger.error(
          { err, requestId: event.payload.requestId },
          'Failed to execute automatic matching run for created blood request'
        );
      }
    }
  });
}
