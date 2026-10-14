import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Select } from '../../components/ui/Select.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { Modal } from '../../components/ui/Modal.js';
import { Toast } from '../../components/ui/Toast.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';

interface EmergencyRequestItem {
  id: string;
  bloodGroup: string;
  units: number;
  urgency: string;
  status: string;
  notifiedCount: number;
  acceptedCount: number;
  createdAt: string;
}

const INITIAL_REQUESTS: EmergencyRequestItem[] = [
  {
    id: 'req-001',
    bloodGroup: 'O_NEG',
    units: 2,
    urgency: 'CRITICAL',
    status: 'DISPATCHING',
    notifiedCount: 5,
    acceptedCount: 1,
    createdAt: '10 mins ago'
  },
  {
    id: 'req-002',
    bloodGroup: 'B_POS',
    units: 3,
    urgency: 'URGENT',
    status: 'FULFILLED',
    notifiedCount: 8,
    acceptedCount: 3,
    createdAt: '45 mins ago'
  }
];

const COLUMNS: Column<EmergencyRequestItem>[] = [
  { key: 'id', header: 'REQUEST ID', render: (r) => <span className="font-mono text-xs">{r.id}</span> },
  { key: 'bloodGroup', header: 'BLOOD GROUP', render: (r) => <span className="font-mono font-medium">{r.bloodGroup.replace('_', ' ')}</span> },
  { key: 'units', header: 'REQUIRED UNITS' },
  {
    key: 'urgency',
    header: 'URGENCY',
    render: (r) => (
      <Badge variant={r.urgency === 'CRITICAL' ? 'urgent' : 'info'} dot>
        {r.urgency}
      </Badge>
    )
  },
  {
    key: 'status',
    header: 'STATUS',
    render: (r) => (
      <Badge variant={r.status === 'FULFILLED' ? 'success' : 'neutral'}>
        {r.status}
      </Badge>
    )
  },
  {
    key: 'progress',
    header: 'MATCH PROGRESS',
    render: (r) => (
      <span className="text-xs font-mono text-[#dadbdf]">
        {r.acceptedCount} / {r.units} accepted ({r.notifiedCount} notified)
      </span>
    )
  }
];

export function HospitalPage(): React.ReactElement {
  const [requests, setRequests] = useState<EmergencyRequestItem[]>(INITIAL_REQUESTS);
  const [modalOpen, setModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [bloodGroup, setBloodGroup] = useState('O_NEG');
  const [units, setUnits] = useState('2');
  const [urgency, setUrgency] = useState('CRITICAL');
  const [notes, setNotes] = useState('');

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const newReq: EmergencyRequestItem = {
      id: `req-00${requests.length + 1}`,
      bloodGroup,
      units: parseInt(units, 10) || 1,
      urgency,
      status: 'DISPATCHING',
      notifiedCount: 5,
      acceptedCount: 0,
      createdAt: 'Just now'
    };

    setRequests([newReq, ...requests]);
    setModalOpen(false);
    setToastMessage(`Emergency request created for ${newReq.units} units of ${newReq.bloodGroup}. Tier 1 candidates notified.`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast
            title="Dispatch Loop Initiated"
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
          <h1 className="text-2xl font-normal text-[#ffffff] tracking-tight">
            Emergency Blood Dispatch Requests
          </h1>
          <p className="text-xs text-[#7d8187] mt-1">
            Exact volunteer coordinates are cloaked. Contact phone number revealed only upon donor acceptance.
          </p>
        </div>

        <Button variant="primary" onClick={() => setModalOpen(true)}>
          Create Emergency Request
        </Button>
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <Eyebrow size="sm">ACTIVE CLINICAL DEMAND</Eyebrow>
          <CardTitle>Recent Emergency Requests</CardTitle>
          <CardDescription>
            Deterministic ABO/Rh compatibility filters out incompatible donors before ML scoring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            data={requests}
            keyExtractor={(r) => r.id}
          />
        </CardContent>
      </Card>

      {/* Create Request Modal with accessible form controls */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Dispatch Emergency Blood Request"
        description="Stage 1 filters compatible donors strictly. Stage 2 ranks candidates by response likelihood."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateRequest}>
              Confirm & Dispatch Alerts
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateRequest} className="flex flex-col gap-4">
          <Select
            label="Required Blood Group"
            value={bloodGroup}
            onChange={(e) => setBloodGroup(e.target.value)}
            options={[
              { value: 'O_NEG', label: 'O Negative (Universal Red Cell)' },
              { value: 'O_POS', label: 'O Positive' },
              { value: 'A_NEG', label: 'A Negative' },
              { value: 'A_POS', label: 'A Positive' },
              { value: 'B_NEG', label: 'B Negative' },
              { value: 'B_POS', label: 'B Positive' },
              { value: 'AB_NEG', label: 'AB Negative' },
              { value: 'AB_POS', label: 'AB Positive' }
            ]}
          />

          <TextInput
            label="Units Required"
            type="number"
            min={1}
            max={10}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            helperText="Whole blood bags (350ml - 450ml statutory standard)"
          />

          <Select
            label="Clinical Urgency"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            options={[
              { value: 'CRITICAL', label: 'Critical (Trauma / OR Immediate Need)' },
              { value: 'URGENT', label: 'Urgent (Scheduled Surgery within 4h)' },
              { value: 'ROUTINE', label: 'Routine (Replenishment)' }
            ]}
          />

          <Textarea
            label="Clinical Log Reference"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ward 4 trauma OT bed #3..."
            helperText="Do not record donor PHI or exact location details in free text"
          />
        </form>
      </Modal>
    </div>
  );
}

export default HospitalPage;
