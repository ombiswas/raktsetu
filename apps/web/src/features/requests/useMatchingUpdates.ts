import { useEffect, useRef, useCallback } from 'react';

interface UseMatchingUpdatesOptions {
  requestId: string;
  onUpdate: () => void;
  pollingIntervalMs?: number;
  enabled?: boolean;
}

export function useMatchingUpdates({
  requestId,
  onUpdate,
  pollingIntervalMs = 8000,
  enabled = true
}: UseMatchingUpdatesOptions): { isSseConnected: boolean } {
  const isConnectedRef = useRef<boolean>(false);
  const reconnectDelayRef = useRef<number>(1000);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const connectSse = useCallback(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      return;
    }

    try {
      const es = new EventSource('/api/v1/notifications/stream');
      eventSourceRef.current = es;

      es.onopen = () => {
        isConnectedRef.current = true;
        reconnectDelayRef.current = 1000; // Reset backoff on successful connection
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // If the event payload matches this request ID or is a global matching update
          if (!data.requestId || data.requestId === requestId) {
            onUpdateRef.current();
          }
        } catch {
          // If non-JSON heartbeat or ping, trigger update refresh
          onUpdateRef.current();
        }
      };

      // Also listen to named domain event types if dispatched
      const handleDomainEvent = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (!data.requestId || data.requestId === requestId) {
            onUpdateRef.current();
          }
        } catch {
          onUpdateRef.current();
        }
      };

      es.addEventListener('donor_response', handleDomainEvent);
      es.addEventListener('batch_expanded', handleDomainEvent);
      es.addEventListener('request_updated', handleDomainEvent);

      es.onerror = () => {
        isConnectedRef.current = false;
        es.close();
        eventSourceRef.current = null;

        // Exponential backoff with 30s ceiling
        const nextDelay = Math.min(reconnectDelayRef.current * 2, 30000);
        reconnectDelayRef.current = nextDelay;

        reconnectTimeoutRef.current = setTimeout(() => {
          connectSse();
        }, nextDelay);
      };
    } catch {
      isConnectedRef.current = false;
      // Scheduled retry on instant failure
      const nextDelay = Math.min(reconnectDelayRef.current * 2, 30000);
      reconnectDelayRef.current = nextDelay;
      reconnectTimeoutRef.current = setTimeout(connectSse, nextDelay);
    }
  }, [requestId, enabled]);

  useEffect(() => {
    if (!enabled) return;

    // 1. Establish SSE stream with reconnect backoff
    connectSse();

    // 2. Setup robust fallback polling interval
    const pollingInterval = setInterval(() => {
      onUpdateRef.current();
    }, pollingIntervalMs);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      clearInterval(pollingInterval);
    };
  }, [connectSse, enabled, pollingIntervalMs]);

  return { isSseConnected: isConnectedRef.current };
}

export default useMatchingUpdates;
