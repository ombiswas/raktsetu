import { EventEmitter } from 'node:events';
import type { RequestStatus } from './state-machine.js';

export interface RequestCreatedPayload {
  requestId: string;
  hospitalId: string;
  bloodGroup: string;
  component: string;
  unitsRequired: number;
  urgency: string;
  neededBy: Date;
  location: { latitude: number; longitude: number };
}

export interface RequestStatusChangedPayload {
  requestId: string;
  hospitalId: string;
  previousStatus: RequestStatus;
  newStatus: RequestStatus;
  reason?: string | undefined;
}

export interface RequestCreatedEvent {
  type: 'RequestCreated';
  occurredAt: Date;
  payload: RequestCreatedPayload;
}

export interface RequestStatusChangedEvent {
  type: 'RequestStatusChanged';
  occurredAt: Date;
  payload: RequestStatusChangedPayload;
}

export type BloodRequestEvent = RequestCreatedEvent | RequestStatusChangedEvent;

export interface IRequestEventBus {
  emit(event: BloodRequestEvent): void;
  subscribe<T extends BloodRequestEvent['type']>(
    type: T,
    handler: (event: Extract<BloodRequestEvent, { type: T }>) => void | Promise<void>
  ): () => void;
  clearListeners(): void;
}

export class RequestEventBus implements IRequestEventBus {
  private readonly emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  public emit(event: BloodRequestEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  public subscribe<T extends BloodRequestEvent['type']>(
    type: T,
    handler: (event: Extract<BloodRequestEvent, { type: T }>) => void | Promise<void>
  ): () => void {
    const safeListener = (evt: Extract<BloodRequestEvent, { type: T }>) => {
      try {
        const result = handler(evt);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err: unknown) => {
            console.error(`[RequestEventBus] Async subscriber error on '${type}':`, err);
          });
        }
      } catch (err) {
        console.error(`[RequestEventBus] Sync subscriber error on '${type}':`, err);
      }
    };

    this.emitter.on(type, safeListener);
    return () => {
      this.emitter.off(type, safeListener);
    };
  }

  public clearListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export const requestEventBus: IRequestEventBus = new RequestEventBus();
