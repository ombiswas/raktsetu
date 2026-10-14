/**
 * Notifications Routes Plugin
 * Exposes SSE stream, list polling, read acknowledgement, and push subscription.
 */

import type { FastifyPluginAsync } from 'fastify';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { ConsoleMailer, ResendMailer, BrevoMailer, type Mailer } from './infrastructure/mailer.js';
import { DefaultWebPushClient, type WebPushClient } from './infrastructure/web-push-client.js';
import {
  listNotificationsQuerySchema,
  notificationParamSchema,
  pushSubscriptionBodySchema,
  listNotificationsResponseSchema,
  type ListNotificationsQuery,
  type NotificationParam,
  type PushSubscriptionBody
} from './notifications.schema.js';
import { createAuthenticateGuard } from '../../platform/http/guards/index.js';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type { Config } from '../../platform/config/index.js';

export interface NotificationsRoutesOptions {
  db: DatabaseInstance;
  config: Config;
  service?: NotificationsService;
  mailer?: Mailer;
  webPushClient?: WebPushClient;
}

export const notificationsRoutes: FastifyPluginAsync<NotificationsRoutesOptions> = async (
  app,
  options
) => {
  const { db, config } = options;
  const repository = new NotificationsRepository(db);

  let mailer: Mailer = options.mailer ?? new ConsoleMailer();
  if (!options.mailer) {
    if (config.EMAIL_PROVIDER === 'resend' && config.EMAIL_API_KEY) {
      mailer = new ResendMailer(config.EMAIL_API_KEY);
    } else if (config.EMAIL_PROVIDER === 'brevo' && config.EMAIL_API_KEY) {
      mailer = new BrevoMailer(config.EMAIL_API_KEY);
    }
  }

  const webPushClient =
    options.webPushClient ??
    new DefaultWebPushClient({
      publicKey: config.VAPID_PUBLIC_KEY,
      privateKey: config.VAPID_PRIVATE_KEY,
      subject: config.VAPID_SUBJECT
    });

  const service = options.service ?? new NotificationsService(repository, mailer, webPushClient);
  const controller = new NotificationsController(service);

  const authenticate = createAuthenticateGuard(db, config);

  // 1. SSE Stream: GET /v1/notifications/stream
  app.get(
    '/stream',
    {
      config: {
        auth: true
      },
      preHandler: [authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Server-Sent Events (SSE) notification stream',
        description:
          'Establishes real-time SSE stream for the authenticated user with heartbeat and automatic cleanup.'
      }
    },
    controller.streamNotifications
  );

  // 2. Fallback polling: GET /v1/notifications
  app.get<{
    Querystring: ListNotificationsQuery;
  }>(
    '/',
    {
      config: {
        auth: true
      },
      preHandler: [authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'List user notifications (Fallback polling)',
        querystring: listNotificationsQuerySchema,
        response: {
          200: listNotificationsResponseSchema
        }
      }
    },
    controller.getNotifications
  );

  // 3. Mark read: PATCH /v1/notifications/:id/read
  app.patch<{
    Params: NotificationParam;
  }>(
    '/:id/read',
    {
      config: {
        auth: true
      },
      preHandler: [authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Mark notification as read',
        params: notificationParamSchema
      }
    },
    controller.markAsRead
  );

  // 4. Register WebPush: POST /v1/notifications/push-subscription
  app.post<{
    Body: PushSubscriptionBody;
  }>(
    '/push-subscription',
    {
      config: {
        auth: true
      },
      preHandler: [authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Register WebPush VAPID subscription',
        body: pushSubscriptionBodySchema
      }
    },
    controller.registerPushSubscription
  );
};
