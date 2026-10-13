import { ConflictError } from '../../../platform/http/errors.js';

export type RequestStatus = 'open' | 'matching' | 'fulfilled' | 'expired' | 'cancelled';

export const VALID_REQUEST_STATUSES: readonly RequestStatus[] = [
  'open',
  'matching',
  'fulfilled',
  'expired',
  'cancelled'
] as const;

/**
 * Deterministic Transition Table for Blood Request lifecycle:
 *
 * open -> matching -> fulfilled | expired | cancelled
 * (open can also directly transition to cancelled or expired if cancelled before matching or overdue)
 *
 * Terminal states: fulfilled, expired, cancelled (no outgoing transitions allowed)
 */
export const REQUEST_STATUS_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  open: ['matching', 'cancelled', 'expired'],
  matching: ['fulfilled', 'cancelled', 'expired'],
  fulfilled: [],
  expired: [],
  cancelled: []
} as const;

export class InvalidRequestStatusTransitionError extends ConflictError {
  public readonly currentStatus: RequestStatus;
  public readonly targetStatus: RequestStatus;

  constructor(currentStatus: RequestStatus, targetStatus: RequestStatus) {
    super(`Cannot transition blood request from status '${currentStatus}' to '${targetStatus}'`);
    this.name = 'InvalidRequestStatusTransitionError';
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
  }
}

export function canTransitionRequestStatus(
  current: RequestStatus,
  target: RequestStatus
): boolean {
  const allowed = REQUEST_STATUS_TRANSITIONS[current];
  return Boolean(allowed && allowed.includes(target));
}

export function transitionRequestStatus(
  current: RequestStatus,
  target: RequestStatus
): RequestStatus {
  if (!canTransitionRequestStatus(current, target)) {
    throw new InvalidRequestStatusTransitionError(current, target);
  }
  return target;
}
