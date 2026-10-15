import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Toast } from '../../components/ui/Toast.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { apiFetch } from '../../lib/api/index.js';
import { CreateRequestModal } from './CreateRequestModal.js';
import type { BloodRequestItem } from '../requests/request-types.js';

interface RequestsApiResponse {
  requests: BloodRequestItem[];
}

export function HospitalPage(): React.ReactElement {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<RequestsApiResponse>('/api/v1/requests');
      setRequests(data.requests || []);
    } catch {
      setErrorMessage('Unable to load blood requests. Please check connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleRequestCreated = (newReq: BloodRequestItem) => {
    setRequests((prev) => [newReq, ...prev]);
    setToastMessage(`Emergency request created for ${newReq.unitsRequired} units of ${newReq.bloodGroup}. Candidate dispatch active.`);
  };

  const columns: Column<BloodRequestItem>[] = [
    {
      key: 'id',
      header: 'REQUEST ID',
      render: (r) => (
        <span className="font-mono text-xs text-canvas-fg select-all">
          {r.id.slice(0, 8)}...
        </span>
      )
    },
    {
      key: 'bloodGroup',
      header: 'BLOOD GROUP',
      render: (r) => (
        <span className="font-mono font-medium text-canvas-fg">
          {r.bloodGroup}
        </span>
      )
    },
    {
      key: 'component',
      header: 'COMPONENT',
      render: (r) => (
        <span className="font-mono text-xs text-body-mid">
          {r.component.replace('_', ' ').toUpperCase()}
        </span>
      )
    },
    {
      key: 'units',
      header: 'UNITS (FULFILLED/REQ)',
      render: (r) => (
        <span className="font-mono text-xs text-canvas-fg">
          {r.unitsFulfilled} / {r.unitsRequired}
        </span>
      )
    },
    {
      key: 'urgency',
      header: 'URGENCY',
      render: (r) => (
        <Badge
          variant={r.urgency === 'critical' ? 'urgent' : r.urgency === 'urgent' ? 'info' : 'neutral'}
          dot={r.urgency === 'critical'}
        >
          {r.urgency.toUpperCase()}
        </Badge>
      )
    },
    {
      key: 'status',
      header: 'STATUS',
      render: (r) => {
        const variant =
          r.status === 'fulfilled'
            ? 'success'
            : r.status === 'matching'
              ? 'urgent'
              : r.status === 'open'
                ? 'info'
                : 'neutral';
        return (
          <Badge variant={variant} dot={r.status === 'matching'}>
            {r.status.toUpperCase()}
          </Badge>
        );
      }
    },
    {
      key: 'neededBy',
      header: 'NEEDED BY',
      render: (r) => (
        <span className="font-mono text-xs text-body-mid">
          {new Date(r.neededBy).toLocaleDateString()} {new Date(r.neededBy).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'RADAR & MATCHING',
      render: (r) => (
        <Button
          variant="outline-sm"
          onClick={() => navigate(`/hospital/requests/${r.id}`)}
        >
          Inspect Matching
        </Button>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast
            title="Dispatch Loop Active"
            description={toastMessage}
            variant="urgent"
            onDismiss={() => setToastMessage(null)}
          />
        </div>
      )}

      {/* Header with CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Eyebrow variant="sunset">HOSPITAL EMERGENCY WORKSPACE</Eyebrow>
          <h1 className="text-3xl font-normal text-canvas-fg tracking-tight">
            Emergency Blood Dispatch Requests
          </h1>
          <p className="text-xs text-body-mid mt-1">
            Exact volunteer coordinates remain cloaked. Contact phone numbers are revealed exclusively upon voluntary donor acceptance.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsModalOpen(true)}
        >
          Create Emergency Request
        </Button>
      </div>

      {/* Research Boundary Disclaimer */}
      <div
        role="note"
        aria-label="Simulation prototype notice"
        className="p-3 bg-canvas-card border border-hairline rounded-lg text-xs text-body-mid flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-sunset animate-pulse" />
          <span className="font-mono text-accent-sunset">SIMULATION RESEARCH PROTOTYPE:</span>
          <span>Deterministic blood compatibility applied strictly. Not a clinical decision engine.</span>
        </div>
        <Badge variant="neutral">ACADEMIC BENCHMARK</Badge>
      </div>

      {/* Requests Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow size="sm">ACTIVE CLINICAL DEMAND</Eyebrow>
              <CardTitle>Hospital Emergency Blood Requests</CardTitle>
              <CardDescription>
                Live monitoring of automated compatibility verification and adaptive candidate dispatch batches.
              </CardDescription>
            </div>
            <Button variant="outline-sm" onClick={fetchRequests} disabled={isLoading}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Spinner size="lg" label="Loading emergency requests" />
            </div>
          ) : errorMessage ? (
            <div className="p-6 bg-accent-sunset/10 border border-accent-sunset/40 rounded-lg text-center space-y-3">
              <div className="font-mono text-sm text-accent-sunset">{errorMessage}</div>
              <Button variant="outline-sm" onClick={fetchRequests}>
                Retry Loading Requests
              </Button>
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              title="No Emergency Requests Dispatched"
              description="Create a new emergency blood request to initiate deterministic ABO/Rh compatibility filtering and prioritized volunteer notifications."
              action={
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                  Create Emergency Request
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={requests}
              keyExtractor={(r) => r.id}
            />
          )}
        </CardContent>
      </Card>

      {/* Create Request Modal */}
      <CreateRequestModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRequestCreated={handleRequestCreated}
      />
    </div>
  );
}

export default HospitalPage;
