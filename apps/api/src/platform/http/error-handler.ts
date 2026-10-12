import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, ValidationError } from './errors.js';
import { resolveRequestId } from '../logging/index.js';

export interface UniformErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

/**
 * Central Fastify error handler. Returns strictly uniform error responses.
 * Details are included ONLY for validation errors; stack traces are NEVER exposed.
 */
export function createErrorHandler() {
  return function errorHandler(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): void {
    const requestId = request.id || resolveRequestId(request.headers['x-request-id']);

    // Ensure the reply sends the request ID header
    void reply.header('x-request-id', requestId);

    // 1. Domain AppError instances
    if (error instanceof AppError) {
      const isValidation = error instanceof ValidationError;
      const responsePayload: UniformErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(isValidation && error.details !== undefined ? { details: error.details } : {})
        }
      };

      if (error.statusCode >= 500) {
        request.log.error({ err: error, requestId }, 'AppError 5xx occurred');
      } else {
        request.log.warn({ err: error, requestId }, 'AppError 4xx occurred');
      }

      void reply.status(error.statusCode).send(responsePayload);
      return;
    }

    // 2. Fastify or Zod schema validation errors
    const isFastifyValidation =
      Boolean((error as FastifyError).validation) ||
      error.name === 'ZodError' ||
      (error as FastifyError).code === 'FST_ERR_VALIDATION';

    if (isFastifyValidation) {
      const validationDetails =
        (error as FastifyError).validation ??
        (error as unknown as { issues?: unknown }).issues ??
        error.message;

      const responsePayload: UniformErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId,
          details: validationDetails
        }
      };

      request.log.warn({ err: error, requestId }, 'Request validation failed');
      void reply.status(400).send(responsePayload);
      return;
    }

    // 3. Fastify Rate Limit errors (429)
    if (
      (error as FastifyError).statusCode === 429 ||
      (error as FastifyError).code === 'FST_ERR_RATE_LIMIT_EXCEEDED'
    ) {
      const responsePayload: UniformErrorResponse = {
        error: {
          code: 'RATE_LIMITED',
          message: error.message || 'Rate limit exceeded, please retry later',
          requestId
        }
      };

      request.log.warn({ requestId }, 'Rate limit exceeded');
      void reply.status(429).send(responsePayload);
      return;
    }

    // 4. Fastify Payload Too Large (413)
    if (
      (error as FastifyError).statusCode === 413 ||
      (error as FastifyError).code === 'FST_ERR_CTP_BODY_TOO_LARGE'
    ) {
      const responsePayload: UniformErrorResponse = {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the maximum permitted limit of 100kb',
          requestId
        }
      };

      request.log.warn({ requestId }, 'Request payload too large');
      void reply.status(413).send(responsePayload);
      return;
    }

    // 5. Fastify 404 error routed here
    if (
      (error as FastifyError).statusCode === 404 ||
      (error as FastifyError).code === 'FST_ERR_NOT_FOUND'
    ) {
      const responsePayload: UniformErrorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
          requestId
        }
      };

      void reply.status(404).send(responsePayload);
      return;
    }

    // 6. Generic Fastify 4xx client errors
    const clientStatusCode = (error as FastifyError).statusCode;
    if (typeof clientStatusCode === 'number' && clientStatusCode >= 400 && clientStatusCode < 500) {
      const responsePayload: UniformErrorResponse = {
        error: {
          code: (error as FastifyError).code || 'BAD_REQUEST',
          message: error.message || 'Client request error',
          requestId
        }
      };

      request.log.warn({ err: error, requestId, statusCode: clientStatusCode }, 'Client request error');
      void reply.status(clientStatusCode).send(responsePayload);
      return;
    }

    // 7. Unhandled / Unexpected Server Errors (500)
    request.log.error({ err: error, requestId }, 'Unhandled internal server error');

    const responsePayload: UniformErrorResponse = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred',
        requestId
      }
    };

    void reply.status(500).send(responsePayload);
  };
}

/**
 * 404 Not Found handler returning uniform shape.
 */
export function createNotFoundHandler() {
  return function notFoundHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): void {
    const requestId = request.id || resolveRequestId(request.headers['x-request-id']);
    void reply.header('x-request-id', requestId);

    const responsePayload: UniformErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId
      }
    };

    void reply.status(404).send(responsePayload);
  };
}
