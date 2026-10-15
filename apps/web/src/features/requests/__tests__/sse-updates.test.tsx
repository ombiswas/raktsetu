import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchingUpdates } from '../useMatchingUpdates.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (!this.closed && this.onopen) {
        this.onopen();
      }
    }, 5);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    if (type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
    if (this.listeners[type]) {
      this.listeners[type].forEach((fn) => fn(event));
    }
  }

  triggerError() {
    if (this.onerror) {
      this.onerror();
    }
  }

  close() {
    this.closed = true;
  }
}

describe('useMatchingUpdates (SSE Real-Time & Reconnect Backoff)', () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.EventSource = originalEventSource;
  });

  it('connects to /api/v1/notifications/stream and triggers onUpdate when relevant message arrives', async () => {
    const onUpdateMock = vi.fn();

    renderHook(() =>
      useMatchingUpdates({
        requestId: 'req-alpha-123',
        onUpdate: onUpdateMock,
        pollingIntervalMs: 60000
      })
    );

    // Initial connection established
    expect(MockEventSource.instances.length).toBe(1);
    const firstInstance = MockEventSource.instances[0];
    expect(firstInstance).toBeDefined();
    expect(firstInstance?.url).toBe('/api/v1/notifications/stream');

    act(() => {
      vi.advanceTimersByTime(10);
    });

    // Send matching event for this request
    act(() => {
      firstInstance?.emit('donor_response', {
        requestId: 'req-alpha-123',
        status: 'accepted'
      });
    });

    expect(onUpdateMock).toHaveBeenCalledTimes(1);

    // Send unrelated event for another request - should not trigger
    act(() => {
      firstInstance?.emit('donor_response', {
        requestId: 'other-request-id',
        status: 'declined'
      });
    });

    expect(onUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('performs exponential reconnect backoff when SSE connection drops', async () => {
    const onUpdateMock = vi.fn();

    renderHook(() =>
      useMatchingUpdates({
        requestId: 'req-alpha-123',
        onUpdate: onUpdateMock,
        pollingIntervalMs: 60000
      })
    );

    expect(MockEventSource.instances.length).toBe(1);
    const instance0 = MockEventSource.instances[0];
    expect(instance0).toBeDefined();

    // First disconnect -> triggers 2000ms backoff
    act(() => {
      instance0?.triggerError();
    });

    expect(instance0?.closed).toBe(true);

    // After 1000ms: not yet reconnected
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances.length).toBe(1);

    // After 2000ms: reconnects!
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances.length).toBe(2);

    // Second disconnect -> backoff doubles to 4000ms
    const instance1 = MockEventSource.instances[1];
    expect(instance1).toBeDefined();
    act(() => {
      instance1?.triggerError();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(MockEventSource.instances.length).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances.length).toBe(3);
  });

  it('triggers onUpdate periodically via polling fallback', async () => {
    const onUpdateMock = vi.fn();

    renderHook(() =>
      useMatchingUpdates({
        requestId: 'req-alpha-123',
        onUpdate: onUpdateMock,
        pollingIntervalMs: 5000
      })
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onUpdateMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onUpdateMock).toHaveBeenCalledTimes(2);
  });
});
