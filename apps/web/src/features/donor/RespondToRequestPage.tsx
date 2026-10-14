import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api/index.js';
import type { BloodRequestDetails } from './donor-types.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Toast } from '../../components/ui/Toast.js';

export function RespondToRequestPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [requestData, setRequestData] = useState<BloodRequestDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Optimistic response state
  const [optimisticResponse, setOptimisticResponse] = useState<'accepted' | 'declined' | null>(null);
  const [toastNotification, setToastNotification] = useState<{
    title: string;
    description: string;
    variant: 'info' | 'urgent';
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadRequest() {
      if (!id) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await apiFetch<BloodRequestDetails>(`/api/v1/requests/${id}`);
        if (isMounted) {
          setRequestData(data);
        }
      } catch {
        if (isMounted) {
          // If request endpoint is unavailable or simulated
          setErrorMessage('Could not load emergency request details. The request may have expired or fulfilled.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadRequest();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleAction = async (action: 'accept' | 'decline') => {
    if (!id) return;

    // 1. Optimistic update
    const previousState = optimisticResponse;
    setOptimisticResponse(action === 'accept' ? 'accepted' : 'declined');

    try {
      await apiFetch<{ response: 'accepted' | 'declined'; message: string }>(
        `/api/v1/requests/${id}/respond`,
        {
          method: 'POST',
          body: JSON.stringify({ action })
        }
      );

      setToastNotification({
        title: action === 'accept' ? 'Emergency Request Accepted' : 'Request Declined',
        description:
          action === 'accept'
            ? 'Thank you! Your contact coordinates have been securely revealed strictly to the hospital emergency team.'
            : 'You declined this request. Your fatigue penalty has been preserved.',
        variant: action === 'accept' ? 'info' : 'urgent'
      });
    } catch {
      // 2. Rollback on API error
      setOptimisticResponse(previousState);
      setToastNotification({
        title: 'Action Failed',
        description: 'Unable to record your response. Please try again.',
        variant: 'urgent'
      });
    }
  };

  const isUrgent =
    requestData?.urgency === 'critical' || requestData?.urgency === 'urgent';

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {toastNotification && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast
            title={toastNotification.title}
            description={toastNotification.description}
            variant={toastNotification.variant}
            onDismiss={() => setToastNotification(null)}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline-sm" onClick={() => navigate('/donor')}>
          ← Return to Donor Portal
        </Button>
        <span className="font-mono text-xs text-canvas-muted">REQUEST #{id?.slice(0, 8)}</span>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Eyebrow variant={isUrgent ? 'sunset' : 'breeze'}>
              CRITICAL EMERGENCY RESPONSE GATE
            </Eyebrow>
            {requestData && (
              <Badge variant={isUrgent ? 'urgent' : 'neutral'}>
                {requestData.urgency.toUpperCase()} PRIORITY
              </Badge>
            )}
          </div>
          <CardTitle>Emergency Volunteer Blood Dispatch</CardTitle>
          <CardDescription>
            A verified healthcare facility has requested emergency blood matching your biological profile. Please review clinical details before responding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton variant="rect" className="h-32" />
              <Skeleton variant="text" className="w-full h-8" />
              <Skeleton variant="text" className="w-full h-8" />
            </div>
          ) : errorMessage ? (
            <div
              role="alert"
              className="p-4 bg-sunset-edge/10 border border-sunset-edge/40 rounded-lg text-xs font-mono text-sunset-glow space-y-2"
            >
              <div className="font-semibold">{errorMessage}</div>
              <p className="text-canvas-muted text-[11px]">
                Emergency requests automatically expire or close when required units are fulfilled by earlier responding donors.
              </p>
            </div>
          ) : requestData ? (
            <>
              {/* Highlight Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-canvas-card rounded-lg border border-canvas-subtle">
                <div>
                  <span className="text-[10px] uppercase font-mono text-canvas-muted block">
                    Required Group
                  </span>
                  <span className="text-2xl font-normal text-canvas-fg">
                    {requestData.bloodGroup}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-canvas-muted block">
                    Component
                  </span>
                  <span className="text-sm font-medium text-canvas-fg capitalize">
                    {requestData.component}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-canvas-muted block">
                    Units Needed
                  </span>
                  <span className="text-sm font-medium text-canvas-fg">
                    {requestData.unitsRequired - requestData.unitsFulfilled} remaining
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-canvas-muted block">
                    Urgency
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      isUrgent ? 'text-sunset-glow font-mono' : 'text-canvas-fg'
                    }`}
                  >
                    {requestData.urgency.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Facility & Location Details */}
              <div className="p-4 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg space-y-2 text-xs">
                <div className="font-mono uppercase text-canvas-fg text-[11px] tracking-wider">
                  Requesting Healthcare Institution
                </div>
                <div className="text-sm font-medium text-canvas-fg">
                  {requestData.hospitalName}
                </div>
                <div className="text-canvas-muted">{requestData.hospitalAddress}</div>
                <div className="text-xs font-mono text-breeze-glow pt-1">
                  Approximate proximity: ~3.2 km distance band
                </div>
              </div>

              {/* Optimistic Status Display */}
              {optimisticResponse && (
                <div
                  role="status"
                  className={`p-4 rounded-lg border font-mono text-xs flex items-center justify-between ${
                    optimisticResponse === 'accepted'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-canvas-subtle bg-canvas-card text-canvas-muted'
                  }`}
                >
                  <span>
                    Current Decision:{' '}
                    <strong>{optimisticResponse.toUpperCase()}</strong>
                  </span>
                  <span className="text-[11px]">
                    {optimisticResponse === 'accepted'
                      ? 'Contact revealed to hospital'
                      : 'Declined voluntarily'}
                  </span>
                </div>
              )}

              {/* Action Buttons (Pill Buttons) */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-canvas-subtle/20">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAction('decline')}
                  disabled={optimisticResponse === 'declined'}
                  className="w-full sm:w-auto"
                >
                  {optimisticResponse === 'declined' ? 'Declined' : 'Decline Request'}
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleAction('accept')}
                  disabled={optimisticResponse === 'accepted'}
                  className="w-full sm:w-auto"
                >
                  {optimisticResponse === 'accepted' ? 'Accepted' : 'Accept & Reveal Contact'}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default RespondToRequestPage;
