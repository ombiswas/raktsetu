import React, { useState } from 'react';
import { apiFetch } from '../../lib/api/index.js';
import type { DonorProfile } from './donor-types.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';

export interface LocationConsentCardProps {
  profile: DonorProfile;
  onLocationSaved?: () => void;
}

export function LocationConsentCard({
  profile,
  onLocationSaved
}: LocationConsentCardProps): React.ReactElement {
  const [latitude, setLatitude] = useState<number | ''>(28.6139);
  const [longitude, setLongitude] = useState<number | ''>(77.209);
  const [consentGiven, setConsentGiven] = useState<boolean>(false);
  const [isGpsLoading, setIsGpsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedCoarseCenter, setSavedCoarseCenter] = useState<{
    lat: number;
    lng: number;
    updatedAt: string;
  } | null>(
    profile.hasLocation
      ? {
          lat: 28.6139,
          lng: 77.209,
          updatedAt: profile.locationUpdatedAt || new Date().toISOString()
        }
      : null
  );

  // Browser Geolocation API strictly on user click - never auto-requests on mount
  const handleAcquireGps = () => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!('geolocation' in navigator)) {
      setErrorMessage('Geolocation API is not supported by your browser. Please enter coordinates manually.');
      return;
    }

    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(Number(pos.coords.latitude.toFixed(6)));
        setLongitude(Number(pos.coords.longitude.toFixed(6)));
        setIsGpsLoading(false);
        setStatusMessage('GPS coordinates acquired from your device.');
      },
      (err) => {
        setIsGpsLoading(false);
        if (err.code === 1) {
          setErrorMessage('Location permission was denied. You can enter your coordinates manually below.');
        } else if (err.code === 2) {
          setErrorMessage('Location position unavailable. Please enter coordinates manually.');
        } else {
          setErrorMessage('Location request timed out. Please try again or enter manually.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!consentGiven) {
      setErrorMessage('Explicit user consent is strictly required to store geospatial coordinates.');
      return;
    }

    if (latitude === '' || longitude === '') {
      setErrorMessage('Please provide valid latitude and longitude coordinates.');
      return;
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setErrorMessage('Latitude must be between -90 and 90, and longitude between -180 and 180.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ message: string; locationUpdatedAt: string }>(
        '/api/v1/donors/me/location',
        {
          method: 'PUT',
          body: JSON.stringify({
            latitude: Number(latitude),
            longitude: Number(longitude),
            consentGiven: true
          })
        }
      );

      setSavedCoarseCenter({
        lat: Number(latitude),
        lng: Number(longitude),
        updatedAt: res.locationUpdatedAt
      });
      setStatusMessage('Geospatial location saved with explicit consent.');
      if (onLocationSaved) {
        onLocationSaved();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update location.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="relative">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <Eyebrow variant="breeze" size="sm">
              GEOSPATIAL PRIVACY BOUNDARY
            </Eyebrow>
            <CardTitle>Location Consent & Proximity Routing</CardTitle>
          </div>
          <Badge variant={savedCoarseCenter ? 'success' : 'neutral'}>
            {savedCoarseCenter ? 'LOCATION CONFIGURED' : 'NO LOCATION SET'}
          </Badge>
        </div>
        <CardDescription>
          RaktSetu enforces strict spatial privacy. We disclose exactly what is stored, why it is stored, and guarantee your precise address is never broadcast.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Transparent Disclosure Card */}
        <div className="p-4 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg space-y-2 text-xs">
          <div className="font-mono uppercase text-canvas-fg text-[11px] tracking-wider">
            Transparency Disclosure & Consent Notice
          </div>
          <p className="text-canvas-muted">
            <strong className="text-canvas-fg font-normal">What is stored:</strong> A single geographic point (latitude and longitude) stored as a PostGIS geography in the secure database.
          </p>
          <p className="text-canvas-muted">
            <strong className="text-canvas-fg font-normal">Why it is stored:</strong> To calculate approximate travel distance bands (e.g. ~3 km away) when a nearby hospital issues a critical blood request.
          </p>
          <p className="text-canvas-muted">
            <strong className="text-canvas-fg font-normal">Who can see it:</strong> Nobody. Exact coordinates are NEVER shared with hospitals, patients, or other donors. Only approximate distance bands are shown.
          </p>
        </div>

        {/* Location Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-canvas-fg">Coordinate Acquisition</div>
              <p className="text-xs text-canvas-muted">
                Use your device GPS or enter manual coordinates below. Geolocation is never triggered automatically.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAcquireGps}
              isLoading={isGpsLoading}
              className="shrink-0"
            >
              Acquire via Device GPS
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Latitude (-90 to 90)"
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value === '' ? '' : parseFloat(e.target.value))}
              required
            />
            <TextInput
              label="Longitude (-180 to 180)"
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value === '' ? '' : parseFloat(e.target.value))}
              required
            />
          </div>

          {/* Explicit Consent Checkbox */}
          <div className="flex items-start gap-3 p-3 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg">
            <input
              id="location-consent-checkbox"
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-canvas-subtle bg-canvas-card text-canvas-fg focus:ring-2 focus:ring-canvas-fg"
            />
            <label htmlFor="location-consent-checkbox" className="text-xs text-canvas-fg cursor-pointer select-none">
              I give explicit, informed consent for RaktSetu to store my approximate coordinates for emergency dispatch matching. I understand my exact location is never publicly disclosed.
            </label>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-sunset-edge/10 border border-sunset-edge/40 rounded-lg text-xs font-mono text-sunset-glow"
            >
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className="p-3 bg-canvas-subtle/20 border border-canvas-subtle/40 rounded-lg text-xs font-mono text-breeze-glow"
            >
              {statusMessage}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!consentGiven}
            >
              Save Location with Explicit Consent
            </Button>
          </div>
        </form>

        {/* Coarse Map Circle Display (Saved Location Only) */}
        {savedCoarseCenter && (
          <div className="pt-4 border-t border-canvas-subtle/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Eyebrow size="sm">PRIVACY RADIUS VISUALIZATION</Eyebrow>
                <div className="text-sm font-medium text-canvas-fg">Coarse Coverage Area</div>
              </div>
              <span className="text-[11px] font-mono text-canvas-muted">
                Updated {new Date(savedCoarseCenter.updatedAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Coarse Privacy Circle Display */}
            <div
              data-testid="coarse-circle-view"
              className="h-48 w-full bg-canvas-card rounded-lg border border-canvas-subtle relative flex items-center justify-center overflow-hidden"
              aria-label="Coarse approximate location circle without pinpoint marker"
            >
              {/* Privacy grid background */}
              <div
                className="absolute inset-0 opacity-15"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)',
                  backgroundSize: '16px 16px'
                }}
              />

              {/* Coarse approximate circle - NO pinpoint marker */}
              <div className="relative flex items-center justify-center">
                {/* 3 km Outer Coarse Ring */}
                <div className="w-36 h-36 rounded-full border border-breeze-edge/40 bg-breeze-edge/5 animate-pulse flex items-center justify-center">
                  {/* 1.5 km Inner Ring */}
                  <div className="w-20 h-20 rounded-full border border-dashed border-breeze-edge/60 bg-breeze-edge/10 flex items-center justify-center">
                    <span className="font-mono text-[10px] text-breeze-glow font-medium">~2.5 km</span>
                  </div>
                </div>
              </div>

              {/* Privacy reassurance badge */}
              <div className="absolute bottom-2 left-2 right-2 text-center text-[10px] font-mono text-canvas-muted bg-canvas-base/80 py-1 px-2 rounded border border-canvas-subtle/30">
                Coarse radius representation. Precise coordinates are obfuscated to protect donor residential privacy.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
