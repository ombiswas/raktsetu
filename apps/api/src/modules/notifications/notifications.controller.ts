/**
 * Notifications Controller
 * Handles list retrieval, read acknowledgement, push registration, and SSE streaming.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { NotificationsService } from './notifications.service.js';
import type {
  ListNotificationsQuery,
  NotificationParam,
  PushSubscriptionBody
} from './notifications.schema.js';
import { UnauthorizedError, NotFoundError } from '../../platform/http/errors.js';

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  public getNotifications = async (
    req: FastifyRequest<{ Querystring: ListNotificationsQuery }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication required to retrieve notifications');
    }

    const { limit, offset, unreadOnly } = req.query;
    const notifications = await this.service.getNotifications(user.id, {
      limit,
      offset,
      unreadOnly
    });

    await reply.status(200).send({ notifications });
  };

  public markAsRead = async (
    req: FastifyRequest<{ Params: NotificationParam }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication required to update notification status');
    }

    const { id } = req.params;
    const updated = await this.service.markAsRead(id, user.id);
    if (!updated) {
      throw new NotFoundError(`Notification '${id}' not found`);
    }

    await reply.status(200).send({ success: true, id });
  };

  public registerPushSubscription = async (
    req: FastifyRequest<{ Body: PushSubscriptionBody }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication required to register push subscriptions');
    }

    await this.service.registerPushSubscription(user.id, req.body);
    await reply.status(201).send({ success: true });
  };

  public streamNotifications = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication required for SSE notification stream');
    }

    const raw = reply.raw;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no');
    raw.flushHeaders?.();

    // 1. Send initial connection confirmation
    raw.write('event: connected\ndata: {"status":"connected"}\n\n');

    // 2. Subscribe to real-time events for this user
    const unsubscribe = this.service.addSseListener(user.id, (message: string) => {
      try {
        raw.write(message);
      } catch {
        // Socket closed
      }
    });

    // 3. Periodic heartbeat to keep connection alive and detect dropped clients
    const heartbeatTimer = setInterval(() => {
      try {
        raw.write(': ping\n\n');
      } catch {
        cleanup();
      }
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    };

    req.raw.on('close', cleanup);
    req.raw.on('end', cleanup);
  };
}
