import React, { useState } from 'react';
import { apiFetch } from '../../lib/api/index.js';
import type { DonorProfile } from './donor-types.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';

export interface DonorAvailabilityCardProps {
  profile: DonorProfile;
  onProfileUpdated: (updated: DonorProfile) => void;
}

export function DonorAvailabilityCard({
  profile,
  onProfileUpdated
}: DonorAvailabilityCardProps): React.ReactElement {
  const [isAvailable, setIsAvailable] = useState<boolean>(profile.isAvailable);
  const [availableFrom, setAvailableFrom] = useState<string>(
    profile.availableFrom ? profile.availableFrom.slice(0, 16) : ''
  );
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEligibleNow = !profile.eligibleAfter || new Date(profile.eligibleAfter) <= new Date();

  const handleToggle = async (newAvailable: boolean) => {
    setIsUpdating(true);
    setErrorMessage(null);
    try {
      const payload: { isAvailable: boolean; availableFrom?: string | null } = {
        isAvailable: newAvailable
      };

      if (!newAvailable && availableFrom) {
        payload.availableFrom = new Date(availableFrom).toISOString();
      } else if (newAvailable) {
        payload.availableFrom = null;
      }

      const updated = await apiFetch<DonorProfile>('/api/v1/donors/me', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setIsAvailable(updated.isAvailable);
      if (!updated.isAvailable && updated.availableFrom) {
        setAvailableFrom(updated.availableFrom.slice(0, 16));
      } else {
        setAvailableFrom('');
      }
      onProfileUpdated(updated);
    } catch {
      setErrorMessage('Failed to update availability status.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleScheduledSave = async () => {
    if (!availableFrom) return;
    setIsUpdating(true);
    setErrorMessage(null);
    try {
      const updated = await apiFetch<DonorProfile>('/api/v1/donors/me', {
        method: 'PATCH',
        body: JSON.stringify({
          isAvailable: false,
          availableFrom: new Date(availableFrom).toISOString()
        })
      });
      setIsAvailable(false);
      onProfileUpdated(updated);
    } catch {
      setErrorMessage('Failed to save scheduled availability.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <Eyebrow variant={isAvailable ? 'breeze' : 'sunset'} size="sm">
              DISPATCH READINESS
            </Eyebrow>
            <CardTitle>Availability & Statutory Cooldown</CardTitle>
          </div>
          <Badge variant={isAvailable ? 'success' : 'neutral'} dot>
            {isAvailable ? 'READY FOR DISPATCH' : 'DISPATCH PAUSED'}
          </Badge>
        </div>
        <CardDescription>
          When active, the priority engine includes you in candidate runs. You may pause availability or schedule automatic resumption.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Clinical Eligibility Banner */}
        <div className="p-3 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-canvas-muted block font-mono uppercase text-[10px]">
              Statutory Donation Interval
            </span>
            <span className="font-medium text-canvas-fg">
              {isEligibleNow
                ? 'Statutory 90-day cooldown satisfied. Clinically eligible.'
                : `Next statutory eligibility: ${new Date(profile.eligibleAfter!).toLocaleDateString()}`}
            </span>
          </div>
          <Badge variant={isEligibleNow ? 'success' : 'urgent'}>
            {isEligibleNow ? 'ELIGIBLE' : 'IN COOLDOWN'}
          </Badge>
        </div>

        {/* Toggle Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div>
            <div className="text-sm font-medium text-canvas-fg">
              {isAvailable ? 'Current Status: Accepting Dispatch Requests' : 'Current Status: Paused'}
            </div>
            <p className="text-xs text-canvas-muted">
              {isAvailable
                ? 'You will receive emergency alerts when matching patients need blood.'
                : 'You will not be notified until you reactivate or your scheduled resume time arrives.'}
            </p>
          </div>

          <Button
            type="button"
            variant={isAvailable ? 'primary' : 'outline'}
            onClick={() => handleToggle(!isAvailable)}
            isLoading={isUpdating}
          >
            {isAvailable ? 'Pause Availability' : 'Activate Dispatch'}
          </Button>
        </div>

        {/* Scheduled Availability Option */}
        {!isAvailable && (
          <div className="pt-3 border-t border-canvas-subtle/20 space-y-3">
            <div className="text-xs text-canvas-muted">
              Optionally set a scheduled date and time when your availability will automatically reactivate:
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <TextInput
                  label="Available From (Scheduled Reactivation)"
                  type="datetime-local"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleScheduledSave}
                isLoading={isUpdating}
                disabled={!availableFrom}
              >
                Schedule Reactivation
              </Button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="p-3 bg-sunset-edge/10 border border-sunset-edge/40 rounded-lg text-xs font-mono text-sunset-glow"
          >
            {errorMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
