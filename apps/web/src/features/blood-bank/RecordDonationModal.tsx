import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal.js';
import { Button } from '../../components/ui/Button.js';
import { Select } from '../../components/ui/Select.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Badge } from '../../components/ui/Badge.js';
import { apiClient } from '../../lib/api/client.js';
import type { BloodComponent, SafeDonorSummary, RecordDonationInput } from './blood-bank-types.js';

export interface RecordDonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenDeferModal?: (donorId: string) => void;
}

const COMPONENTS: { label: string; value: BloodComponent }[] = [
  { label: 'Whole Blood (standard 450ml)', value: 'whole_blood' },
  { label: 'Packed Red Blood Cells (RBC)', value: 'rbc' },
  { label: 'Fresh Frozen Plasma (FFP)', value: 'plasma' },
  { label: 'Platelet Concentrate', value: 'platelets' }
];

export function RecordDonationModal({
  isOpen,
  onClose,
  onSuccess,
  onOpenDeferModal
}: RecordDonationModalProps): React.ReactElement {
  const [donorSearchId, setDonorSearchId] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundDonor, setFoundDonor] = useState<SafeDonorSummary | null>(null);

  const [component, setComponent] = useState<BloodComponent>('whole_blood');
  const [units, setUnits] = useState<number>(1);
  const [requestId, setRequestId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    setFoundDonor(null);

    const query = donorSearchId.trim();
    if (!query) {
      setSearchError('Please enter a valid Donor ID or Code (UUID format).');
      return;
    }

    try {
      setIsSearching(true);
      const data = await apiClient.get<SafeDonorSummary>(`/api/v1/blood-banks/donors/${query}`);
      setFoundDonor(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Donor profile not found for this ID';
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const isDonorDeferred = Boolean(
    foundDonor?.eligibleAfter && new Date(foundDonor.eligibleAfter).getTime() > Date.now()
  );

  const handleSubmitDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!foundDonor) {
      setSubmitError('Search and verify donor eligibility before recording donation.');
      return;
    }

    if (isDonorDeferred) {
      setSubmitError(
        `Donor is under medical deferral until ${foundDonor.eligibleAfter}. Cannot record donation.`
      );
      return;
    }

    if (units < 1 || units > 10 || !Number.isInteger(units)) {
      setSubmitError('Units must be an integer between 1 and 10.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: RecordDonationInput = {
        donorId: foundDonor.id,
        bloodGroup: foundDonor.bloodGroup,
        component,
        units,
        requestId: requestId.trim() || undefined
      };

      await apiClient.post('/api/v1/blood-banks/me/donations', payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record completed donation';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFoundDonor(null);
    setDonorSearchId('');
    setSearchError(null);
    setSubmitError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Completed Donation"
      description="Verify donor eligibility code and atomically credit inventory."
      maxWidth="lg"
      footer={
        <>
          <Button variant="outline-sm" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {foundDonor && (
            <Button
              variant="primary"
              type="submit"
              form="record-donation-form"
              isLoading={isSubmitting}
              disabled={isSubmitting || isDonorDeferred}
            >
              Confirm Donation Event
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Step 1: Privacy-Preserving Donor Lookup */}
        <div className="p-4 bg-canvas-card border border-hairline rounded space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-body-mid">
              Step 1: Donor Identifier Lookup
            </span>
            <span className="text-[11px] font-mono text-accent-info">Zero-PII Privacy Enforced</span>
          </div>

          {!foundDonor ? (
            <form onSubmit={handleLookup} className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextInput
                    label="Donor ID / Code"
                    placeholder="Enter Donor UUID (e.g. 11111111-1111-1111-1111-111111111111)"
                    value={donorSearchId}
                    onChange={(e) => setDonorSearchId(e.target.value)}
                    helperText="Donor lookup strictly uses system UUIDs or QR codes. Free-text name/phone search is prohibited."
                    required
                  />
                </div>
                <div className="self-end pb-1">
                  <Button
                    variant="primary"
                    type="submit"
                    isLoading={isSearching}
                    disabled={isSearching || !donorSearchId.trim()}
                  >
                    Verify Donor
                  </Button>
                </div>
              </div>

              {searchError && (
                <div
                  role="alert"
                  className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset"
                >
                  {searchError}
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs text-canvas-fg">
                    Donor Code: <span className="text-body-mid font-semibold">{foundDonor.id}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-body-mid">Verified Blood Group:</span>
                    <Badge variant="urgent">{foundDonor.bloodGroup}</Badge>
                  </div>
                </div>
                <Button variant="outline-sm" type="button" onClick={handleReset}>
                  Change Donor
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2.5 bg-canvas-default rounded border border-hairline">
                <div>
                  <span className="text-body-mid">Status: </span>
                  <span className={foundDonor.isAvailable ? 'text-accent-success' : 'text-accent-sunset'}>
                    {foundDonor.isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                  </span>
                </div>
                <div>
                  <span className="text-body-mid">Eligible After: </span>
                  <span className={isDonorDeferred ? 'text-accent-sunset font-bold' : 'text-canvas-fg'}>
                    {foundDonor.eligibleAfter ?? 'Eligible Now'}
                  </span>
                </div>
              </div>

              {isDonorDeferred && (
                <div
                  role="alert"
                  className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset flex items-center justify-between"
                >
                  <div>
                    <strong>CLINICALLY DEFERRED:</strong> Donor cannot donate until {foundDonor.eligibleAfter}.
                  </div>
                </div>
              )}

              {onOpenDeferModal && !isDonorDeferred && (
                <div className="flex justify-end">
                  <Button
                    variant="outline-sm"
                    type="button"
                    onClick={() => onOpenDeferModal(foundDonor.id)}
                  >
                    Clinical Deferral Required?
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Donation Details Form */}
        {foundDonor && (
          <form id="record-donation-form" onSubmit={handleSubmitDonation} className="space-y-4">
            <span className="text-xs font-mono uppercase text-body-mid block">
              Step 2: Collection Details
            </span>

            {submitError && (
              <div
                role="alert"
                className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset"
              >
                {submitError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Component Collected"
                options={COMPONENTS}
                value={component}
                onChange={(e) => setComponent(e.target.value as BloodComponent)}
              />

              <TextInput
                label="Units Collected"
                type="number"
                min={1}
                max={10}
                step={1}
                value={units}
                onChange={(e) => setUnits(parseInt(e.target.value, 10) || 1)}
                helperText="Whole blood donations are normally 1 unit (450ml)."
                required
              />
            </div>

            <TextInput
              label="Associated Emergency Request ID (Optional)"
              placeholder="UUID of emergency hospital request (if applicable)"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              helperText="Linking a request automatically tracks fulfillment."
            />

            <div className="p-3 bg-canvas-card border border-hairline rounded text-[11px] font-mono text-body-mid space-y-1">
              <div className="text-canvas-fg font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-sunset" />
                DETERMINISTIC COOLDOWN APPLIED
              </div>
              <p>
                Recording this donation automatically resets donor cooldown interval (90 days for whole blood, 14 days for platelets/plasma) and credits inventory.
              </p>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
