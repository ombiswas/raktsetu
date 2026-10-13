import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RequestEventBus,
  type RequestCreatedEvent,
  type RequestStatusChangedEvent
} from '../events.js';

describe('RequestEventBus', () => {
  let bus: RequestEventBus;

  beforeEach(() => {
    bus = new RequestEventBus();
  });

  it('emits and delivers RequestCreated event to subscribers', () => {
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('RequestCreated', handler);

    const event: RequestCreatedEvent = {
      type: 'RequestCreated',
      occurredAt: new Date(),
      payload: {
        requestId: 'req-1',
        hospitalId: 'hosp-1',
        bloodGroup: 'O+',
        component: 'whole_blood',
        unitsRequired: 2,
        urgency: 'critical',
        neededBy: new Date(),
        location: { latitude: 28.6, longitude: 77.2 }
      }
    };

    bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);

    unsubscribe();
    bus.emit(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits and delivers RequestStatusChanged event to subscribers', () => {
    const handler = vi.fn();
    bus.subscribe('RequestStatusChanged', handler);

    const event: RequestStatusChangedEvent = {
      type: 'RequestStatusChanged',
      occurredAt: new Date(),
      payload: {
        requestId: 'req-1',
        hospitalId: 'hosp-1',
        previousStatus: 'open',
        newStatus: 'matching'
      }
    };

    bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('isolates subscriber errors so one failure does not crash bus or other subscribers', () => {
    const errorSubscriber = vi.fn().mockImplementation(() => {
      throw new Error('Subscriber error simulation');
    });
    const goodSubscriber = vi.fn();

    bus.subscribe('RequestCreated', errorSubscriber);
    bus.subscribe('RequestCreated', goodSubscriber);

    const event: RequestCreatedEvent = {
      type: 'RequestCreated',
      occurredAt: new Date(),
      payload: {
        requestId: 'req-2',
        hospitalId: 'hosp-2',
        bloodGroup: 'A+',
        component: 'rbc',
        unitsRequired: 1,
        urgency: 'urgent',
        neededBy: new Date(),
        location: { latitude: 28.5, longitude: 77.1 }
      }
    };

    expect(() => bus.emit(event)).not.toThrow();
    expect(errorSubscriber).toHaveBeenCalledTimes(1);
    expect(goodSubscriber).toHaveBeenCalledTimes(1);
  });
});
