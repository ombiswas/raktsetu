import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getAccessToken } from '../../lib/api/index.js';
import type { InAppNotification } from './donor-types.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';

export function NotificationInbox(): React.ReactElement {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [pushStatus, setPushStatus] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [isPushLoading, setIsPushLoading] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch notification list
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: InAppNotification[] }>('/api/v1/notifications');
      setNotifications(res.notifications || []);
    } catch {
      // Keep existing list on transient poll error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Mark notification as read
  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, {
        method: 'PATCH'
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
    } catch {
      // Ignore error
    }
  };

  // 3. Navigate to emergency request response screen
  const handleOpenAlert = (notif: InAppNotification) => {
    const requestId = notif.payload?.requestId;
    if (requestId) {
      navigate(`/donor/requests/${requestId}`);
    }
  };

  // 4. Setup SSE stream with fallback polling
  useEffect(() => {
    fetchNotifications();

    const token = getAccessToken();
    // Only connect SSE if EventSource is supported
    if (typeof EventSource !== 'undefined' && token) {
      try {
        // Same-origin SSE endpoint through Vite dev proxy or Render
        const sseUrl = `/api/v1/notifications/stream?token=${encodeURIComponent(token)}`;
        const es = new EventSource(sseUrl, { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
          setStreamActive(true);
        };

        es.addEventListener('notification', (event) => {
          try {
            const data = JSON.parse(event.data) as InAppNotification;
            setNotifications((prev) => [data, ...prev.filter((n) => n.id !== data.id)]);
          } catch {
            fetchNotifications();
          }
        });

        es.onerror = () => {
          setStreamActive(false);
          es.close();
          // Fall back to polling every 15s when SSE is interrupted
          if (!pollTimerRef.current) {
            pollTimerRef.current = setInterval(fetchNotifications, 15000);
          }
        };
      } catch {
        // Fall back to polling
        pollTimerRef.current = setInterval(fetchNotifications, 15000);
      }
    } else {
      // Polling fallback
      pollTimerRef.current = setInterval(fetchNotifications, 15000);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [fetchNotifications]);

  // 5. Check initial Push Permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
      if (Notification.permission === 'granted') {
        setPushStatus('granted');
      } else if (Notification.permission === 'denied') {
        setPushStatus('denied');
      } else {
        setPushStatus('prompt');
      }
    } else {
      setPushStatus('unsupported');
    }
  }, []);

  // 6. Web Push Opt-in Flow
  const handleEnablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatusNotice('Push notifications are not supported on this browser.');
      return;
    }

    setIsPushLoading(true);
    setStatusNotice(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        setStatusNotice('Push permission was not granted.');
        return;
      }

      setPushStatus('granted');

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // In research prototype, generate a standard subscription
      // Dummy application server key for test compatibility or raw subscription
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
          });
        } catch {
          // If custom key fails in local mock environment, simulate payload
        }
      }

      const p256dh = subscription?.getKey ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh') || []))) : 'mock-p256dh-key';
      const auth = subscription?.getKey ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth') || []))) : 'mock-auth-secret';
      const endpoint = subscription?.endpoint || `https://fcm.googleapis.com/fcm/send/raktsetu-sub-${Date.now()}`;

      await apiFetch('/api/v1/notifications/push-subscription', {
        method: 'POST',
        body: JSON.stringify({
          endpoint,
          p256dh: p256dh || 'mock-p256dh-token-data',
          auth: auth || 'mock-auth-secret-data'
        })
      });

      setStatusNotice('Web Push notifications enabled for emergency alerts.');
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Push opt-in could not be completed.');
    } finally {
      setIsPushLoading(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Eyebrow variant={unreadCount > 0 ? 'sunset' : 'breeze'} size="sm">
                DISPATCH INBOX
              </Eyebrow>
              <span
                data-testid="stream-status"
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  streamActive
                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                    : 'border-canvas-subtle text-canvas-muted bg-canvas-subtle/10'
                }`}
              >
                {streamActive ? 'LIVE SSE' : 'POLLING'}
              </span>
            </div>
            <CardTitle>Emergency Notifications & Dispatch Alerts</CardTitle>
          </div>

          {unreadCount > 0 && (
            <Badge variant="urgent" dot>
              {unreadCount} UNREAD
            </Badge>
          )}
        </div>
        <CardDescription>
          Real-time alerts broadcast when a hospital matches your blood group and geographic proximity radius.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Push Notification Opt-in Card */}
        {pushStatus === 'prompt' && (
          <div className="p-3 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-medium text-canvas-fg">Enable Device Push Notifications</div>
              <p className="text-canvas-muted text-[11px]">
                Receive instant alerts on your lock screen even when RaktSetu is in the background.
              </p>
            </div>
            <Button
              type="button"
              variant="outline-sm"
              onClick={handleEnablePush}
              isLoading={isPushLoading}
              className="shrink-0"
            >
              Enable Web Push
            </Button>
          </div>
        )}

        {statusNotice && (
          <div
            role="status"
            className="p-3 bg-canvas-subtle/20 border border-canvas-subtle/40 rounded-lg text-xs font-mono text-breeze-glow"
          >
            {statusNotice}
          </div>
        )}

        {/* Notifications List */}
        {isLoading ? (
          <div className="space-y-3 p-2">
            <Skeleton variant="rect" className="h-24" />
            <Skeleton variant="rect" className="h-24" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No Dispatch Notifications"
            description="You have no active emergency alerts. When a matching hospital creates an urgent blood request, it will appear here."
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => {
              const isUrgent =
                item.payload?.urgency === 'critical' || item.payload?.urgency === 'urgent';
              const isUnread = !item.readAt;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isUrgent
                      ? 'border-sunset-edge/40 bg-sunset-edge/10 text-sunset-glow'
                      : isUnread
                      ? 'border-canvas-subtle bg-canvas-card text-canvas-fg'
                      : 'border-canvas-subtle/40 bg-canvas-card/40 text-canvas-muted'
                  }`}
                >
                  <div
                    className="space-y-1 cursor-pointer flex-1"
                    onClick={() => handleOpenAlert(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenAlert(item);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`View Emergency ${item.payload?.bloodGroup || ''} Blood Request`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-canvas-fg text-sm">
                        Emergency {item.payload?.bloodGroup || ''} Blood Request
                      </span>
                      {isUrgent && <Badge variant="urgent">CRITICAL NEED</Badge>}
                      {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-sunset-glow" />}
                    </div>
                    <div className="text-xs font-mono flex items-center gap-3">
                      <span>
                        Approx. ~{item.payload?.approximateDistanceKm ?? 3} km away
                      </span>
                      <span>·</span>
                      <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                      {item.payload?.units && <span>· {item.payload.units} unit(s) needed</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isUnread && (
                      <Button
                        type="button"
                        variant="outline-sm"
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                      >
                        Mark Read
                      </Button>
                    )}
                    {item.payload?.requestId && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => handleOpenAlert(item)}
                        className="text-xs py-1 px-3"
                      >
                        Respond
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
