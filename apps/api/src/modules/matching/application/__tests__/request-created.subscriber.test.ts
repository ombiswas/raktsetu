import { describe, it, expect, vi } from 'vitest';
import { RequestEventBus } from '../../../blood-requests/domain/events.js';
import { registerRequestCreatedMatchingSubscriber } from '../request-created.subscriber.js';
import type { CreateMatchRunUseCase } from '../create-match-run.usecase.js';

describe('RequestCreatedMatchingSubscriber', () => {
  it('triggers CreateMatchRunUseCase when RequestCreated event is emitted', async () => {
    const bus = new RequestEventBus();
    const mockUseCase = {
      execute: vi.fn().mockResolvedValue({
        run: { id: 'run-1' },
        candidateCount: 5
      })
    } as unknown as CreateMatchRunUseCase;

    const unsubscribe = registerRequestCreatedMatchingSubscriber(bus, mockUseCase);

    bus.emit({
      type: 'RequestCreated',
      occurredAt: new Date(),
      payload: {
        requestId: 'request-123',
        hospitalId: 'hospital-456',
        bloodGroup: 'B+',
        component: 'whole_blood',
        unitsRequired: 2,
        urgency: 'critical',
        neededBy: new Date(),
        location: { latitude: 28.5, longitude: 77.2 }
      }
    });

    // Wait for event handler ticks
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
    expect(mockUseCase.execute).toHaveBeenCalledWith({ requestId: 'request-123' });

    unsubscribe();
  });

  it('unsubscribes cleanly and does not trigger use case after unsubscription', async () => {
    const bus = new RequestEventBus();
    const mockUseCase = {
      execute: vi.fn().mockResolvedValue({})
    } as unknown as CreateMatchRunUseCase;

    const unsubscribe = registerRequestCreatedMatchingSubscriber(bus, mockUseCase);
    unsubscribe();

    bus.emit({
      type: 'RequestCreated',
      occurredAt: new Date(),
      payload: {
        requestId: 'request-cancelled',
        hospitalId: 'hospital-1',
        bloodGroup: 'O-',
        component: 'whole_blood',
        unitsRequired: 1,
        urgency: 'routine',
        neededBy: new Date(),
        location: { latitude: 28.5, longitude: 77.2 }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });
});
