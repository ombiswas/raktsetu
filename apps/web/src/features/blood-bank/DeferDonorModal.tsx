import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { apiClient } from '../../lib/api/client.js';
import type { DeferDonorInput } from './blood-bank-types.js';

export interface DeferDonorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDonorId?: string;
}

export function DeferDonorModal({
  isOpen,
  onClose,
  onSuccess,
  initialDonorId = ''
}: DeferDonorModalProps): React.ReactElement {
  const [donorId, setDonorId] = useState<string>(initialDonorId);
  const [eligibleAfter, setEligibleAfter] = useState<string>(() => {
    // Default to 14 days in future
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedDonorId = donorId.trim();
    if (!trimmedDonorId) {
      setError('A valid Donor UUID is required.');
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError('Clinical deferral reason must be at least 3 characters.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(eligibleAfter)) {
      setError('Eligible after date must be in YYYY-MM-DD format.');
      return;
    }

    const targetDate = new Date(eligibleAfter);
    if (isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now() - 24 * 60 * 60 * 1000) {
      setError('Eligible after date must be in the future.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: DeferDonorInput = {
        eligibleAfter,
        reason: trimmedReason
      };

      await apiClient.post(`/api/v1/blood-banks/donors/${trimmedDonorId}/defer`, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record donor deferral';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Clinical Deferral"
      description="Temporarily or indefinitely defer donor from dispatch for clinical safety."
      maxWidth="md"
      footer={
        <>
          <Button variant="outline-sm" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="defer-donor-form"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Apply Clinical Deferral
          </Button>
        </>
      }
    >
      <form id="defer-donor-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset"
          >
            {error}
          </div>
        )}

        <TextInput
          label="Donor ID / Code (UUID)"
          placeholder="e.g. 11111111-1111-1111-1111-111111111111"
          value={donorId}
          onChange={(e) => setDonorId(e.target.value)}
          required
        />

        <TextInput
          label="Eligible After (YYYY-MM-DD)"
          type="date"
          value={eligibleAfter}
          onChange={(e) => setEligibleAfter(e.target.value)}
          helperText="Date when clinical eligibility can be re-evaluated. Deterministic matcher strictly excludes donor until this date."
          required
        />

        <Textarea
          label="Clinical Deferral Reason"
          placeholder="e.g. Low hemoglobin (<12.5 g/dL), recent international travel to endemic region, active medication"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={255}
          rows={3}
          helperText="Logged immutably in clinical safety audit trail."
          required
        />

        <div className="p-3 bg-canvas-card border border-hairline rounded text-[11px] font-mono text-body-mid space-y-1">
          <div className="text-canvas-fg font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-sunset" />
            SAFETY ENFORCEMENT
          </div>
          <p>
            Deferred donors are immediately barred from all hospital matching pools. ML prioritization never overrides deterministic clinical deferrals.
          </p>
        </div>
      </form>
    </Modal>
  );
}
