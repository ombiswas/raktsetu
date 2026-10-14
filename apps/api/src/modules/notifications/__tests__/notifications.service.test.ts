import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from '../notifications.service.js';
import type { INotificationsRepository } from '../notifications.repository.js';
import type { Mailer } from '../infrastructure/mailer.js';
import type { WebPushClient, WebPushSubscription } from '../infrastructure/web-push-client.js';
import type { DonorAlertPayload, InAppNotificationView } from '../notifications.types.js';

describe('NotificationsService (Multi-Channel & SSE Stream)', () => {
  const donorId = '11111111-2222-3333-4444-555555555555';

  const sampleAlert: DonorAlertPayload = {
    requestId: 'req-abc-123',
    bloodGroup: 'B+',
    urgency: 'critical',
    units: 2,
    respondUrl: 'https://raktsetu.internal/respond?request=req-abc-123',
    approximateDistanceKm: 3.2,
    issuedAt: '2026-10-14T10:00:00.000Z'
  };

  const sampleNotification: InAppNotificationView = {
    id: 'notif-1',
    userId: donorId,
    kind: 'donor_match_alert',
    payload: {
      requestId: sampleAlert.requestId,
      bloodGroup: sampleAlert.bloodGroup,
      urgency: sampleAlert.urgency,
      units: sampleAlert.units,
      respondUrl: sampleAlert.respondUrl,
      approximateDistanceKm: sampleAlert.approximateDistanceKm,
      issuedAt: sampleAlert.issuedAt
    },
    readAt: null,
    createdAt: '2026-10-14T10:00:00.000Z'
  };

  let mockRepo: INotificationsRepository;
  let mockMailer: Mailer;
  let mockWebPushClient: WebPushClient;
  let service: NotificationsService;

  beforeEach(() => {
    mockRepo = {
      createNotification: vi.fn().mockResolvedValue(sampleNotification),
      findNotificationsByUserId: vi.fn().mockResolvedValue([sampleNotification]),
      markAsRead: vi.fn().mockResolvedValue(true),
      findPushSubscriptionsByUserId: vi.fn().mockResolvedValue([]),
      upsertPushSubscription: vi.fn().mockResolvedValue(undefined),
      deletePushSubscription: vi.fn().mockResolvedValue(undefined),
      findUserEmail: vi.fn().mockResolvedValue('donor@example.com')
    };

    mockMailer = {
      send: vi.fn().mockResolvedValue(true)
    };

    mockWebPushClient = {
      sendPush: vi.fn().mockResolvedValue(true)
    };

    service = new NotificationsService(mockRepo, mockMailer, mockWebPushClient);
  });

  it('creates in-app notification and dispatches to active SSE stream listener', async () => {
    const sseMessages: string[] = [];
    const unsubscribe = service.addSseListener(donorId, (msg) => {
      sseMessages.push(msg);
    });

    const result = await service.notifyDonor(donorId, sampleAlert);

    expect(result.id).toBe('notif-1');
    expect(mockRepo.createNotification).toHaveBeenCalledWith(
      donorId,
      'donor_match_alert',
      expect.objectContaining({
        bloodGroup: 'B+',
        urgency: 'critical',
        units: 2,
        respondUrl: sampleAlert.respondUrl
      })
    );

    // Verify SSE dispatch
    expect(sseMessages).toHaveLength(1);
    expect(sseMessages[0]).toContain('event: notification');
    expect(sseMessages[0]).toContain(sampleAlert.requestId);

    // Verify unsubscribe cleans up listener
    unsubscribe();
    await service.notifyDonor(donorId, sampleAlert);
    expect(sseMessages).toHaveLength(1); // No new message after unsubscribe
  });

  it('sends Web Push notifications when donor has active push subscriptions', async () => {
    const sub: WebPushSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/sample-token',
      p256dh: 'BNcRdreALRF8...',
      auth: 'tBHItDa...'
    };
    (mockRepo.findPushSubscriptionsByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([sub]);

    await service.notifyDonor(donorId, sampleAlert);

    expect(mockWebPushClient.sendPush).toHaveBeenCalledTimes(1);
    expect(mockWebPushClient.sendPush).toHaveBeenCalledWith(
      sub,
      expect.objectContaining({
        title: expect.stringContaining('Emergency B+ Blood Request (CRITICAL)'),
        body: expect.stringContaining('Urgent need for 2 unit(s) ~3.2km away'),
        url: sampleAlert.respondUrl,
        requestId: sampleAlert.requestId
      })
    );
  });

  it('sends email alert via Mailer interface when donor email is on file', async () => {
    await service.notifyDonor(donorId, sampleAlert);

    expect(mockMailer.send).toHaveBeenCalledTimes(1);
    expect(mockMailer.send).toHaveBeenCalledWith(
      'donor@example.com',
      expect.stringContaining('[URGENT] Emergency B+ Blood Need in Your Area'),
      expect.stringContaining(sampleAlert.respondUrl)
    );
  });

  it('strict privacy boundary: alert payload and messages contain NO hospital address or patient info', async () => {
    const sseMessages: string[] = [];
    service.addSseListener(donorId, (msg) => sseMessages.push(msg));

    await service.notifyDonor(donorId, sampleAlert);

    const emailBody = (mockMailer.send as ReturnType<typeof vi.fn>).mock.calls[0]![2] as string;
    const ssePayload = sseMessages[0]!;

    // Hospital address / coordinates forbidden
    expect(emailBody).not.toMatch(/Apollo|Max|Sarita Vihar|Room|Bed|Patient/i);
    expect(ssePayload).not.toMatch(/latitude|longitude|address|patient/i);
  });
});
