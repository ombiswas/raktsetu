import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Select } from '../../components/ui/Select.js';
import { Badge } from '../../components/ui/Badge.js';
import { apiFetch } from '../../lib/api/index.js';
import type { BloodGroup, BloodComponent, RequestUrgency, BloodRequestItem } from '../requests/request-types.js';

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestCreated: (newRequest: BloodRequestItem) => void;
}

function getDefaultNeededBy(): string {
  // Default to 4 hours in the future formatted for datetime-local in local timezone
  const d = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function CreateRequestModal({
  isOpen,
  onClose,
  onRequestCreated
}: CreateRequestModalProps): React.ReactElement {
  // Generate a cryptographically random idempotency key per modal mount/open session
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(crypto.randomUUID());
      setIsConfirming(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Form fields
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O-');
  const [component, setComponent] = useState<BloodComponent>('whole_blood');
  const [unitsRequired, setUnitsRequired] = useState<string>('2');
  const [urgency, setUrgency] = useState<RequestUrgency>('critical');
  const [neededBy, setNeededBy] = useState<string>(getDefaultNeededBy());

  // UX State
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedUnits = parseInt(unitsRequired, 10);

  const validate = (): boolean => {
    if (isNaN(parsedUnits) || parsedUnits < 1 || parsedUnits > 20) {
      setErrorMessage('Units required must be between 1 and 20.');
      return false;
    }

    if (!neededBy) {
      setErrorMessage('Needed-by date and time are required.');
      return false;
    }

    const neededDate = new Date(neededBy);
    if (isNaN(neededDate.getTime())) {
      setErrorMessage('Please provide a valid needed-by datetime.');
      return false;
    }

    if (neededDate.getTime() <= Date.now()) {
      setErrorMessage('Needed-by must be a future datetime.');
      return false;
    }

    const thirtyDaysAhead = Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (neededDate.getTime() > thirtyDaysAhead) {
      setErrorMessage('Needed-by must be within 30 days from now.');
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const handleNextToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setIsConfirming(true);
    }
  };

  const handleFinalSubmit = async () => {
    if (!validate()) {
      setIsConfirming(false);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch<BloodRequestItem>('/api/v1/requests', {
        method: 'POST',
        headers: {
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({
          bloodGroup,
          component,
          unitsRequired: parsedUnits,
          urgency,
          neededBy: new Date(neededBy).toISOString()
        })
      });

      onRequestCreated(response);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch blood request';
      setErrorMessage(msg);
      setIsConfirming(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isConfirming ? 'Confirm Emergency Dispatch' : 'New Emergency Blood Request'}
      description="Stage 1 enforces deterministic ABO/Rh compatibility and donor eligibility. Stage 2 ranks candidates."
      footer={
        isConfirming ? (
          <>
            <Button
              variant="outline"
              onClick={() => setIsConfirming(false)}
              disabled={isSubmitting}
            >
              Back to Edit
            </Button>
            <Button
              variant="primary"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Dispatching...' : 'Confirm & Dispatch Alerts'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleNextToConfirm}>
              Review Dispatch Order
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* Research / Medical Disclaimer Banner (Mandatory research boundary) */}
        <div
          role="note"
          aria-label="Medical research prototype disclaimer"
          className="p-3 bg-canvas-soft border border-hairline rounded-md text-xs text-body-mid space-y-1"
        >
          <div className="flex items-center gap-2 font-mono text-xs text-accent-sunset">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-sunset animate-pulse" />
            RESEARCH PROTOTYPE NOTICE: NOT A MEDICAL DECISION
          </div>
          <p>
            RaktSetu is a decision-support simulation system. Blood compatibility is checked
            deterministically. Actual transfusion eligibility, cross-matching, and patient safety
            decisions remain the sole clinical responsibility of licensed attending physicians.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3 bg-accent-sunset/10 border border-accent-sunset/40 rounded-md text-xs text-accent-sunset font-mono"
          >
            {errorMessage}
          </div>
        )}

        {/* Idempotency Key Tag */}
        <div className="flex items-center justify-between text-[11px] font-mono text-body-mid border-b border-hairline pb-2">
          <span>IDEMPOTENCY KEY:</span>
          <span className="text-canvas-fg select-all">{idempotencyKey.slice(0, 18)}...</span>
        </div>

        {!isConfirming ? (
          <form onSubmit={handleNextToConfirm} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                id="req-blood-group"
                label="Required Blood Group"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                options={[
                  { value: 'O-', label: 'O- (Universal RBC Donor)' },
                  { value: 'O+', label: 'O+' },
                  { value: 'A-', label: 'A-' },
                  { value: 'A+', label: 'A+' },
                  { value: 'B-', label: 'B-' },
                  { value: 'B+', label: 'B+' },
                  { value: 'AB-', label: 'AB-' },
                  { value: 'AB+', label: 'AB+ (Universal Plasma Donor)' }
                ]}
              />

              <Select
                id="req-component"
                label="Component Type"
                value={component}
                onChange={(e) => setComponent(e.target.value as BloodComponent)}
                options={[
                  { value: 'whole_blood', label: 'Whole Blood' },
                  { value: 'rbc', label: 'Packed Red Blood Cells (RBC)' },
                  { value: 'plasma', label: 'Fresh Frozen Plasma (FFP)' },
                  { value: 'platelets', label: 'Platelets (Single Donor/Random)' }
                ]}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                id="req-units"
                label="Units Required (1-20)"
                type="number"
                min={1}
                max={20}
                value={unitsRequired}
                onChange={(e) => setUnitsRequired(e.target.value)}
                helperText="Whole bags (approx 350-450 mL standard)"
              />

              <Select
                id="req-urgency"
                label="Emergency Urgency Level"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as RequestUrgency)}
                options={[
                  { value: 'critical', label: 'Critical (Trauma / OR Immediate)' },
                  { value: 'urgent', label: 'Urgent (Required within 2-6 hrs)' },
                  { value: 'standard', label: 'Standard (Elective / Scheduled)' }
                ]}
              />
            </div>

            <TextInput
              id="req-needed-by"
              label="Needed By (Future Datetime)"
              type="datetime-local"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              helperText="Dispatch radius expands adaptively until needed-by deadline"
            />
          </form>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="text-xs text-body-mid">
              Please verify the emergency request parameters prior to dispatching candidate notifications:
            </div>

            <div className="bg-canvas-card border border-hairline rounded-lg p-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-body-mid">BLOOD GROUP:</span>
                <span className="text-canvas-fg font-medium text-sm">{bloodGroup}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-mid">COMPONENT:</span>
                <span className="text-canvas-fg">{component.toUpperCase().replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-mid">UNITS REQUIRED:</span>
                <span className="text-canvas-fg font-medium">{parsedUnits} units</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-mid">URGENCY:</span>
                <Badge variant={urgency === 'critical' ? 'urgent' : urgency === 'urgent' ? 'info' : 'neutral'} dot>
                  {urgency.toUpperCase()}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-mid">NEEDED BY:</span>
                <span className="text-canvas-fg">{new Date(neededBy).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center border-t border-hairline pt-2 text-[11px]">
                <span className="text-body-mid">DISPATCH TIER 1:</span>
                <span className="text-accent-sunset">Top 5 compatible candidates</span>
              </div>
            </div>

            <p className="text-[11px] text-body-mid italic">
              Upon confirmation, the matching pipeline will rank compatible candidates within 5 km and dispatch alerts via WebPush and SMS.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
