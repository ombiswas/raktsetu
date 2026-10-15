/**
 * Web Push Client
 * Uses web-push package with VAPID authentication to dispatch notifications.
 * Fails gracefully when keys are unconfigured or expired.
 */

import webpush from 'web-push';

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushClient {
  sendPush(subscription: WebPushSubscription, payload: Record<string, unknown>): Promise<boolean>;
}

export interface DefaultWebPushOptions {
  publicKey?: string | undefined;
  privateKey?: string | undefined;
  subject?: string | undefined;
}

export class DefaultWebPushClient implements WebPushClient {
  private readonly enabled: boolean;

  constructor(options: DefaultWebPushOptions = {}) {
    if (options.publicKey && options.privateKey) {
      try {
        webpush.setVapidDetails(
          options.subject ?? 'mailto:admin@raktsetu.internal',
          options.publicKey,
          options.privateKey
        );
        this.enabled = true;
      } catch {
        this.enabled = false;
      }
    } else {
      this.enabled = false;
    }
  }

  public async sendPush(
    subscription: WebPushSubscription,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.enabled) {
      return true; // No-op in dev/test without credentials
    }

    try {
      const pushSub = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      };

      await webpush.sendNotification(pushSub, JSON.stringify(payload), {
        TTL: 300, // 5 minute TTL for emergency blood alerts
        timeout: 5000
      });

      return true;
    } catch {
      return false;
    }
  }
}
