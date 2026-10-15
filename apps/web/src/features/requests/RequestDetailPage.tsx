import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { Toast } from '../../components/ui/Toast.js';
import { Card, CardContent } from '../../components/ui/Card.js';
import { apiFetch } from '../../lib/api/index.js';
import { PrivacySafeMap } from './PrivacySafeMap.js';
import { LiveMatchingPanel } from './LiveMatchingPanel.js';
import { AcceptedDonorsPanel } from './AcceptedDonorsPanel.js';
import { CancelRequestModal } from './CancelRequestModal.js';
import { useMatchingUpdates } from './useMatchingUpdates.js';
import type { BloodRequestItem, MatchingStatusData } from './request-types.js';

export function RequestDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<BloodRequestItem | null>(null);
  const [matchingData, setMatchingData] = useState<MatchingStatusData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchRequestAndMatching = useCallback(async () => {
    if (!id) return;

    try {
      // 1. Fetch request details
      const reqData = await apiFetch<BloodRequestItem>(`/api/v1/requests/${id}`);
      setRequest(reqData);

      // 2. Fetch matching status
      const matchData = await apiFetch<MatchingStatusData>(`/api/v1/requests/${id}/matching`);
      setMatchingData(matchData);

      // Check for fulfillment toast
      if (reqData.status === 'fulfilled') {
        setToastMessage(`Emergency blood request ${id.slice(0, 8)} has been fully fulfilled!`);
      }
    } catch {
      setErrorMessage('Unable to load matching radar for this blood request.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRequestAndMatching();
  }, [fetchRequestAndMatching]);

  // Real-time synchronization via SSE stream with fallback polling and exponential backoff
  useMatchingUpdates({
    requestId: id || '',
    onUpdate: fetchRequestAndMatching,
    enabled: Boolean(id && request?.status !== 'fulfilled' && request?.status !== 'cancelled' && request?.status !== 'expired')
  });

  const handleCancelled = (updated: BloodRequestItem) => {
    setRequest(updated);
    setToastMessage(`Request ${updated.id.slice(0, 8)} cancelled successfully. Active dispatch halted.`);
    fetchRequestAndMatching();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Spinner size="lg" label="Loading emergency matching radar" />
        <span className="font-mono text-xs text-body-mid">
          Retrieving anonymized candidate radar and PostGIS distance bands...
        </span>
      </div>
    );
  }

  if (errorMessage || !request) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-canvas-card border border-hairline rounded-lg text-center space-y-4">
        <div className="font-mono text-sm text-accent-sunset">
          {errorMessage || 'Blood request record could not be loaded.'}
        </div>
        <div className="flex justify-center gap-3">
          <Button variant="outline-sm" onClick={() => navigate('/hospital')}>
            Return to Requests
          </Button>
          <Button variant="primary" onClick={fetchRequestAndMatching}>
            Retry Radar Sync
          </Button>
        </div>
      </div>
    );
  }

  const isCancellable = request.status === 'open' || request.status === 'matching';

  const statusVariant =
    request.status === 'fulfilled'
      ? 'success'
      : request.status === 'matching'
        ? 'urgent'
        : request.status === 'open'
          ? 'info'
          : 'neutral';

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast
            title="Dispatch Radar Event"
            description={toastMessage}
            variant={request.status === 'fulfilled' ? 'default' : 'urgent'}
            onDismiss={() => setToastMessage(null)}
          />
        </div>
      )}

      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-hairline">
        <div className="flex items-center gap-3">
          <Button variant="outline-sm" onClick={() => navigate('/hospital')}>
            &larr; All Requests
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-body-mid">ID:</span>
              <span className="font-mono text-xs text-canvas-fg font-medium select-all">
                {request.id}
              </span>
            </div>
            {request.hospitalName && (
              <div className="text-xs text-body-mid font-mono mt-0.5">
                {request.hospitalName}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <Badge variant={statusVariant} dot={request.status === 'matching'}>
            {request.status.toUpperCase()}
          </Badge>
          <Badge
            variant={request.urgency === 'critical' ? 'urgent' : request.urgency === 'urgent' ? 'info' : 'neutral'}
          >
            {request.urgency.toUpperCase()}
          </Badge>

          {isCancellable && (
            <Button variant="outline-sm" onClick={() => setIsCancelModalOpen(true)}>
              Cancel Request
            </Button>
          )}
        </div>
      </div>

      {/* Request Vital Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
        <Card className="bg-canvas-card">
          <CardContent className="p-4">
            <div className="text-xs text-body-mid uppercase">DEMAND</div>
            <div className="text-xl font-bold text-canvas-fg mt-1">
              {request.bloodGroup}
            </div>
            <div className="text-[11px] text-body-mid mt-0.5">
              {request.component.replace('_', ' ').toUpperCase()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-canvas-card">
          <CardContent className="p-4">
            <div className="text-xs text-body-mid uppercase">FULFILLMENT</div>
            <div className="text-xl font-bold text-canvas-fg mt-1">
              {request.unitsFulfilled} / {request.unitsRequired}
            </div>
            <div className="text-[11px] text-accent-sunset mt-0.5">
              {request.unitsFulfilled >= request.unitsRequired ? 'Order Fulfilled' : 'Active Matching'}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-canvas-card">
          <CardContent className="p-4">
            <div className="text-xs text-body-mid uppercase">NEEDED BY</div>
            <div className="text-sm font-bold text-canvas-fg mt-1 truncate">
              {new Date(request.neededBy).toLocaleDateString()}
            </div>
            <div className="text-[11px] text-body-mid mt-0.5">
              {new Date(request.neededBy).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-canvas-card">
          <CardContent className="p-4">
            <div className="text-xs text-body-mid uppercase">DISPATCH RADIUS</div>
            <div className="text-xl font-bold text-canvas-fg mt-1">
              {matchingData?.config?.finalRadiusMeters
                ? `${(matchingData.config.finalRadiusMeters / 1000).toFixed(0)} km`
                : '5 km'}
            </div>
            <div className="text-[11px] text-body-mid mt-0.5">
              Max Limit: 30 km
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Privacy-Preserving Geospatial Radar Map */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow size="sm">GEOSPATIAL CANDIDATE RADAR</Eyebrow>
          <span className="text-[11px] font-mono text-body-mid">
            CARTO Dark Tiles &bull; PostGIS Privacy Radius
          </span>
        </div>
        <PrivacySafeMap
          request={request}
          candidates={matchingData?.candidates || []}
          finalRadiusMeters={matchingData?.config?.finalRadiusMeters ?? 5000}
        />
      </div>

      {/* Confirmed Voluntary Donors (Revealed Contacts Panel) */}
      <AcceptedDonorsPanel candidates={matchingData?.candidates || []} />

      {/* Live Matching & Candidate Prioritization Panel */}
      {matchingData && (
        <LiveMatchingPanel
          matchingData={matchingData}
          unitsRequired={request.unitsRequired}
          unitsFulfilled={request.unitsFulfilled}
        />
      )}

      {/* Cancellation Modal */}
      <CancelRequestModal
        requestId={request.id}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onCancelled={handleCancelled}
      />
    </div>
  );
}

export default RequestDetailPage;
