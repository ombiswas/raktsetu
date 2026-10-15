import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal.js';
import { Button } from '../../components/ui/Button.js';
import { Select } from '../../components/ui/Select.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { apiClient } from '../../lib/api/client.js';
import type { BloodGroup, BloodComponent, AdjustStockInput } from './blood-bank-types.js';

export interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultBloodGroup?: BloodGroup | undefined;
  defaultComponent?: BloodComponent | undefined;
}

const BLOOD_GROUPS: { label: string; value: BloodGroup }[] = [
  { label: 'A+ (A Positive)', value: 'A+' },
  { label: 'A- (A Negative)', value: 'A-' },
  { label: 'B+ (B Positive)', value: 'B+' },
  { label: 'B- (B Negative)', value: 'B-' },
  { label: 'AB+ (AB Positive)', value: 'AB+' },
  { label: 'AB- (AB Negative)', value: 'AB-' },
  { label: 'O+ (O Positive)', value: 'O+' },
  { label: 'O- (O Negative)', value: 'O-' }
];

const COMPONENTS: { label: string; value: BloodComponent }[] = [
  { label: 'Whole Blood (standard 450ml)', value: 'whole_blood' },
  { label: 'Packed Red Blood Cells (RBC)', value: 'rbc' },
  { label: 'Fresh Frozen Plasma (FFP)', value: 'plasma' },
  { label: 'Platelet Concentrate', value: 'platelets' }
];

export function AdjustStockModal({
  isOpen,
  onClose,
  onSuccess,
  defaultBloodGroup = 'O+',
  defaultComponent = 'whole_blood'
}: AdjustStockModalProps): React.ReactElement {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(defaultBloodGroup);
  const [component, setComponent] = useState<BloodComponent>(defaultComponent);
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('An audited operational reason is strictly required for stock adjustments.');
      return;
    }

    if (quantity <= 0 || !Number.isInteger(quantity)) {
      setError('Quantity must be a positive integer greater than zero.');
      return;
    }

    const delta = direction === 'add' ? quantity : -quantity;

    try {
      setIsSubmitting(true);
      const payload: AdjustStockInput = {
        bloodGroup,
        component,
        delta,
        reason: trimmedReason
      };

      await apiClient.post('/api/v1/blood-banks/me/inventory/adjust', payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to adjust inventory stock';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Inventory Stock"
      description="Update verified on-hand unit counts with mandatory reason logging."
      maxWidth="md"
      footer={
        <>
          <Button variant="outline-sm" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="adjust-stock-form"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Confirm Stock Adjustment
          </Button>
        </>
      }
    >
      <form id="adjust-stock-form" noValidate onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Blood Group"
            options={BLOOD_GROUPS}
            value={bloodGroup}
            onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
          />

          <Select
            label="Component"
            options={COMPONENTS}
            value={component}
            onChange={(e) => setComponent(e.target.value as BloodComponent)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Adjustment Type"
            options={[
              { label: 'Add Stock (+ Units)', value: 'add' },
              { label: 'Deduct Stock (- Units)', value: 'deduct' }
            ]}
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'add' | 'deduct')}
          />

          <TextInput
            label="Units (Count)"
            type="number"
            min={1}
            max={500}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
            required
          />
        </div>

        <Textarea
          label="Adjustment Reason (Audited)"
          placeholder="e.g. Physical inventory count correction, spoiled cold-chain batch, hospital walk-in dispatch"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={255}
          rows={3}
          helperText="Required for audit compliance. Stored immutably with operator timestamp."
          required
        />

        <div className="p-3 bg-canvas-card border border-hairline rounded text-[11px] font-mono text-body-mid space-y-1">
          <div className="text-canvas-fg font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-info" />
            AUDIT TRAIL NOTICE
          </div>
          <p>
            Stock movements permanently affect hospital allocation visibility. Never adjust units without verified physical counts.
          </p>
        </div>
      </form>
    </Modal>
  );
}
