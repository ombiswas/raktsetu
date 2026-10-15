import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal.js';
import { Button } from '../../components/ui/Button.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { apiFetch } from '../../lib/api/index.js';
import type { BloodRequestItem } from './request-types.js';

interface CancelRequestModalProps {
  requestId: string;
  isOpen: boolean;
  onClose: () => void;
  onCancelled: (updatedRequest: BloodRequestItem) => void;
}

export function CancelRequestModal({
  requestId,
  isOpen,
  onClose,
  onCancelled
}: CancelRequestModalProps): React.ReactElement {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch<BloodRequestItem>(`/api/v1/requests/${requestId}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({
          reason: reason.trim() || undefined
        })
      });

      onCancelled(response);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel emergency request';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel Emergency Blood Request"
      description="Halts candidate notification loop and marks the emergency request as cancelled."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Keep Request Active
          </Button>
          <Button
            variant="primary"
            onClick={handleCancelSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Cancelling...' : 'Confirm Request Cancellation'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleCancelSubmit} className="space-y-4">
        {errorMessage && (
          <div
            role="alert"
            className="p-3 bg-accent-sunset/10 border border-accent-sunset/40 rounded text-xs font-mono text-accent-sunset"
          >
            {errorMessage}
          </div>
        )}

        <div className="p-3 bg-canvas-soft border border-hairline rounded text-xs text-body space-y-1">
          <div className="font-mono text-xs text-accent-sunset font-medium">
            WARNING: PERMANENT CANCELLATION
          </div>
          <p>
            Cancelling will immediately stop all automated candidate escalations and mark the emergency
            order as cancelled. Any pending notifications sent to voluntary donors will be retracted.
          </p>
        </div>

        <Textarea
          id="cancel-reason"
          label="Cancellation Reason (Optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Patient stabilized, units secured from internal blood bank..."
          helperText="Do not include patient PHI or names."
        />
      </form>
    </Modal>
  );
}

export default CancelRequestModal;
