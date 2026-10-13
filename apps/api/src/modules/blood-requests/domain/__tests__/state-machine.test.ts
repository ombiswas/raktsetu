import { describe, it, expect } from 'vitest';
import {
  transitionRequestStatus,
  canTransitionRequestStatus,
  InvalidRequestStatusTransitionError,
  REQUEST_STATUS_TRANSITIONS,
  VALID_REQUEST_STATUSES,
  type RequestStatus
} from '../state-machine.js';
import { ConflictError } from '../../../../platform/http/errors.js';

describe('Blood Request Domain State Machine', () => {
  describe('Valid Transitions', () => {
    const validPairs: [RequestStatus, RequestStatus][] = [
      ['open', 'matching'],
      ['open', 'cancelled'],
      ['open', 'expired'],
      ['matching', 'fulfilled'],
      ['matching', 'cancelled'],
      ['matching', 'expired']
    ];

    it.each(validPairs)('allows transition from %s to %s', (from, to) => {
      expect(canTransitionRequestStatus(from, to)).toBe(true);
      expect(transitionRequestStatus(from, to)).toBe(to);
    });
  });

  describe('Invalid Transitions Matrix', () => {
    const allStatuses = VALID_REQUEST_STATUSES;

    for (const from of allStatuses) {
      for (const to of allStatuses) {
        const isValid = REQUEST_STATUS_TRANSITIONS[from].includes(to);
        if (!isValid) {
          it(`rejects invalid transition from ${from} to ${to} with typed 409 error`, () => {
            expect(canTransitionRequestStatus(from, to)).toBe(false);
            expect(() => transitionRequestStatus(from, to)).toThrowError(
              InvalidRequestStatusTransitionError
            );

            try {
              transitionRequestStatus(from, to);
            } catch (err) {
              expect(err).toBeInstanceOf(InvalidRequestStatusTransitionError);
              expect(err).toBeInstanceOf(ConflictError);
              const customErr = err as InvalidRequestStatusTransitionError;
              expect(customErr.statusCode).toBe(409);
              expect(customErr.code).toBe('CONFLICT');
              expect(customErr.currentStatus).toBe(from);
              expect(customErr.targetStatus).toBe(to);
              expect(customErr.message).toContain(
                `Cannot transition blood request from status '${from}' to '${to}'`
              );
            }
          });
        }
      }
    }
  });

  describe('Terminal States Invariance', () => {
    const terminalStates: RequestStatus[] = ['fulfilled', 'expired', 'cancelled'];

    it.each(terminalStates)('terminal state %s has zero outgoing transitions', (status) => {
      expect(REQUEST_STATUS_TRANSITIONS[status]).toEqual([]);
      for (const target of VALID_REQUEST_STATUSES) {
        expect(canTransitionRequestStatus(status, target)).toBe(false);
      }
    });
  });
});
