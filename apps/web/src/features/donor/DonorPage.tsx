import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../lib/api/index.js';
import type { DonorProfile } from './donor-types.js';
import { DonorProfileCard } from './DonorProfileCard.js';
import { DonorAvailabilityCard } from './DonorAvailabilityCard.js';
import { DonationHistoryCard } from './DonationHistoryCard.js';
import { LocationConsentCard } from './LocationConsentCard.js';
import { NotificationInbox } from './NotificationInbox.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Button } from '../../components/ui/Button.js';

export function DonorPage(): React.ReactElement {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<DonorProfile>('/api/v1/donors/me');
      setProfile(data);
    } catch {
      setErrorMessage('Unable to load donor profile from server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <Eyebrow size="sm">VOLUNTEER DONOR PORTAL</Eyebrow>
        <h1 className="text-3xl font-normal text-canvas-fg tracking-tight">
          Donor Operations & Dispatch Hub
        </h1>
        <p className="text-xs text-canvas-muted mt-1">
          Deterministic biological hard constraints are evaluated first. Exact GPS coordinates are never broadcast or shared with hospitals.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton variant="rect" className="h-44" />
          <Skeleton variant="rect" className="h-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton variant="rect" className="h-80" />
            <Skeleton variant="rect" className="h-80" />
          </div>
        </div>
      ) : errorMessage || !profile ? (
        <div className="p-6 bg-sunset-edge/10 border border-sunset-edge/40 rounded-lg text-center space-y-3">
          <div className="font-mono text-sm text-sunset-glow">
            {errorMessage || 'Profile could not be loaded.'}
          </div>
          <Button variant="outline" onClick={fetchProfile}>
            Retry Loading Profile
          </Button>
        </div>
      ) : (
        <>
          {/* Availability and Dispatch Status */}
          <DonorAvailabilityCard profile={profile} onProfileUpdated={(up) => setProfile(up)} />

          {/* Real-time Emergency Notifications & Push Opt-In */}
          <NotificationInbox />

          {/* Location Consent & Profile Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <LocationConsentCard profile={profile} onLocationSaved={fetchProfile} />
            <DonorProfileCard profile={profile} onProfileUpdated={(up) => setProfile(up)} />
          </div>

          {/* Verified Donation History */}
          <DonationHistoryCard />
        </>
      )}
    </div>
  );
}

export default DonorPage;
