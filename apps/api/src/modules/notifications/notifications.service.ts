/**
 * Notifications Service
 * Coordinates in-app, Web Push, and email delivery.
 * Manages active Server-Sent Events (SSE) connections with heartbeat and cleanup.
 */

import type { INotificationsRepository } from './notifications.repository.js';
import type { Mailer } from './infrastructure/mailer.js';
import type { WebPushClient, WebPushSubscription } from './infrastructure/web-push-client.js';
import type { DonorAlertPayload, InAppNotificationView } from './notifications.types.js';

export type SseListener = (data: string) => void;

export class NotificationsService {
  private readonly sseClients = new Map<string, Set<SseListener>>();

  constructor(
    private readonly repository: INotificationsRepository,
    private readonly mailer: Mailer,
    private readonly webPushClient: WebPushClient
  ) {}

  /**
   * Dispatches emergency notification across available channels.
   * Privacy boundary: Alert payload contains NO hospital address or patient details.
   */
  public async notifyDonor(donorId: string, alert: DonorAlertPayload): Promise<InAppNotificationView> {
    const payloadRecord: Record<string, unknown> = {
      requestId: alert.requestId,
      bloodGroup: alert.bloodGroup,
      urgency: alert.urgency,
      units: alert.units,
      respondUrl: alert.respondUrl,
      approximateDistanceKm: alert.approximateDistanceKm,
      issuedAt: alert.issuedAt
    };

    // 1. In-App Notification (Always)
    const notification = await this.repository.createNotification(
      donorId,
      'donor_match_alert',
      payloadRecord
    );

    // 2. Real-time SSE Dispatch to active client streams
    this.broadcastToSse(donorId, 'notification', notification);

    // 3. Web Push Notification (if subscriber exists)
    const subscriptions = await this.repository.findPushSubscriptionsByUserId(donorId);
    if (subscriptions.length > 0) {
      const pushTitle = `Emergency ${alert.bloodGroup} Blood Request (${alert.urgency.toUpperCase()})`;
      const pushBody = `Urgent need for ${alert.units} unit(s) ~${alert.approximateDistanceKm ?? 3}km away. Please respond.`;

      for (const sub of subscriptions) {
        // Fire and forget, don't let 1 bad subscription fail the loop
        this.webPushClient
          .sendPush(sub, {
            title: pushTitle,
            body: pushBody,
            url: alert.respondUrl,
            requestId: alert.requestId
          })
          .catch(() => {});
      }
    }

    // 4. Email Notification (if email available)
    const email = await this.repository.findUserEmail(donorId);
    if (email) {
      const emailSubject = `[URGENT] Emergency ${alert.bloodGroup} Blood Need in Your Area`;
      const emailBody = [
        `Dear Donor,`,
        ``,
        `An emergency blood request has matched your profile:`,
        `- Blood Group Required: ${alert.bloodGroup}`,
        `- Urgency Tier: ${alert.urgency.toUpperCase()}`,
        `- Units Required: ${alert.units}`,
        `- Approximate Distance: ~${alert.approximateDistanceKm ?? 3} km`,
        ``,
        `To accept or decline this emergency request, please visit:`,
        `${alert.respondUrl}`,
        ``,
        `Thank you for being a registered voluntary donor with RaktSetu.`
      ].join('\n');

      this.mailer.send(email, emailSubject, emailBody).catch(() => {});
    }

    return notification;
  }

  public async getNotifications(
    userId: string,
    options?: { limit?: number | undefined; offset?: number | undefined; unreadOnly?: boolean | undefined }
  ): Promise<InAppNotificationView[]> {
    return this.repository.findNotificationsByUserId(userId, options);
  }

  public async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    return this.repository.markAsRead(notificationId, userId);
  }

  public async registerPushSubscription(
    userId: string,
    subscription: WebPushSubscription
  ): Promise<void> {
    await this.repository.upsertPushSubscription(userId, subscription);
  }

  /**
   * Registers a client listener for SSE streaming.
   * Returns an unsubscribe function that cleans up the listener on disconnect.
   */
  public addSseListener(userId: string, listener: SseListener): () => void {
    let userSet = this.sseClients.get(userId);
    if (!userSet) {
      userSet = new Set<SseListener>();
      this.sseClients.set(userId, userSet);
    }
    userSet.add(listener);

    return () => {
      const set = this.sseClients.get(userId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.sseClients.delete(userId);
        }
      }
    };
  }

  private broadcastToSse(userId: string, event: string, data: unknown): void {
    const listeners = this.sseClients.get(userId);
    if (!listeners || listeners.size === 0) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const listener of listeners) {
      try {
        listener(message);
      } catch {
        // Listener dropped
      }
    }
  }
}
