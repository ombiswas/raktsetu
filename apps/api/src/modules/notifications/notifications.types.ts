/**
 * Notification Types & DTOs
 * Privacy rule: Notification messages MUST NEVER leak hospital exact coordinates,
 * physical street addresses, or patient clinical identifiers.
 */

export interface DonorAlertPayload {
  requestId: string;
  bloodGroup: string;
  urgency: 'critical' | 'urgent' | 'standard';
  units: number;
  respondUrl: string;
  approximateDistanceKm?: number;
  issuedAt: string;
}

export interface InAppNotificationView {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}
