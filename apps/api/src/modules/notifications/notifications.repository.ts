/**
 * Notifications Repository
 * Database access layer for notifications and push subscriptions using Drizzle ORM.
 */

import { eq, and, isNull, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import { notifications, pushSubscriptions, users } from '../../platform/database/schema.js';
import type { InAppNotificationView } from './notifications.types.js';
import type { WebPushSubscription } from './infrastructure/web-push-client.js';

export interface INotificationsRepository {
  createNotification(
    userId: string,
    kind: string,
    payload: Record<string, unknown>
  ): Promise<InAppNotificationView>;
  findNotificationsByUserId(
    userId: string,
    options?: { limit?: number | undefined; offset?: number | undefined; unreadOnly?: boolean | undefined }
  ): Promise<InAppNotificationView[]>;
  markAsRead(notificationId: string, userId: string): Promise<boolean>;
  findPushSubscriptionsByUserId(userId: string): Promise<WebPushSubscription[]>;
  upsertPushSubscription(userId: string, sub: WebPushSubscription): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  findUserEmail(userId: string): Promise<string | null>;
}

export class NotificationsRepository implements INotificationsRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async createNotification(
    userId: string,
    kind: string,
    payload: Record<string, unknown>
  ): Promise<InAppNotificationView> {
    const [row] = await this.db
      .insert(notifications)
      .values({
        userId,
        kind,
        payload
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create notification: insert returned no rows');
    }

    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      payload: row.payload as Record<string, unknown>,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString()
    };
  }

  public async findNotificationsByUserId(
    userId: string,
    options: { limit?: number | undefined; offset?: number | undefined; unreadOnly?: boolean | undefined } = {}
  ): Promise<InAppNotificationView[]> {
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = Math.max(0, options.offset ?? 0);

    const conditions = [eq(notifications.userId, userId)];
    if (options.unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      kind: r.kind,
      payload: r.payload as Record<string, unknown>,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString()
    }));
  }

  public async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });

    return result.length > 0;
  }

  public async findPushSubscriptionsByUserId(userId: string): Promise<WebPushSubscription[]> {
    const rows = await this.db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    return rows;
  }

  public async upsertPushSubscription(
    userId: string,
    sub: WebPushSubscription
  ): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      });
  }

  public async deletePushSubscription(endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  public async findUserEmail(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return row ? row.email : null;
  }
}
