/**
 * Notification Zod Schemas
 */

import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val.toLowerCase() === 'true' || val === '1';
      }
      return val;
    }, z.boolean())
    .optional()
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationParamSchema = z.object({
  id: z.string().uuid()
});

export type NotificationParam = z.infer<typeof notificationParamSchema>;

export const pushSubscriptionBodySchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(10),
  auth: z.string().min(10)
});

export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBodySchema>;

export const inAppNotificationItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  kind: z.string(),
  payload: z.record(z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string()
});

export const listNotificationsResponseSchema = z.object({
  notifications: z.array(inAppNotificationItemSchema)
});
