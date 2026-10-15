import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BloodRequestItem, MatchingCandidate } from './request-types.js';

interface PrivacySafeMapProps {
  request: BloodRequestItem;
  candidates: MatchingCandidate[];
  finalRadiusMeters?: number;
}

// Deterministic hash to generate jitter angles for privacy-cloaked candidate markers
function hashStringToAngle(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

// Parses "< 1 km" -> 600m, "2-3 km" -> 2500m, "5-6 km" -> 5500m
function parseApproximateDistanceToMeters(band: string): number {
  if (band.startsWith('<')) {
    return 600;
  }
  const match = band.match(/(\d+)-(\d+)\s*km/);
  if (match && match[1] && match[2]) {
    const low = parseInt(match[1], 10);
    const high = parseInt(match[2], 10);
    return ((low + high) / 2) * 1000;
  }
  const single = band.match(/(\d+)\s*km/);
  if (single && single[1]) {
    return parseInt(single[1], 10) * 1000;
  }
  return 3000;
}

// Project (lat, lon) by distance and bearing
function offsetCoordinates(
  lat: number,
  lon: number,
  distanceMeters: number,
  bearingDegrees: number
): [number, number] {
  const rad = (bearingDegrees * Math.PI) / 180;
  const dLat = (distanceMeters * Math.cos(rad)) / 111320;
  const dLon = (distanceMeters * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lon + dLon];
}

// Custom DivIcons matching design tokens
function createHospitalIcon(urgency: string): L.DivIcon {
  const strokeColor = urgency === 'critical' ? '#ff7a17' : '#ffffff';
  return L.divIcon({
    className: 'custom-hospital-marker',
    html: `
      <div style="
        width: 28px;
        height: 28px;
        background: #0a0a0a;
        border: 2px solid ${strokeColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 12px rgba(255, 122, 23, 0.4);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function createCandidateIcon(status: string, rank: number): L.DivIcon {
  const isAccepted = status === 'accepted';
  const isDeclined = status === 'declined' || status === 'no_response';
  const bgColor = isAccepted ? '#ff7a17' : isDeclined ? '#363a3f' : '#1a1c20';
  const textColor = isAccepted ? '#0a0a0a' : isDeclined ? '#7d8187' : '#ffffff';
  const borderColor = isAccepted ? '#ff7a17' : isDeclined ? '#212327' : '#ffffff';

  return L.divIcon({
    className: 'custom-candidate-marker',
    html: `
      <div style="
        width: 22px;
        height: 22px;
        background: ${bgColor};
        border: 1.5px solid ${borderColor};
        border-radius: 50%;
        color: ${textColor};
        font-family: monospace;
        font-size: 10px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
      ">
        ${rank}
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

export function PrivacySafeMap({
  request,
  candidates,
  finalRadiusMeters = 5000
}: PrivacySafeMapProps): React.ReactElement {
  // Center: hospital location or fallback
  const centerLat = request.location?.latitude ?? 28.6139;
  const centerLon = request.location?.longitude ?? 77.209;
  const isCritical = request.urgency === 'critical';
  const circleColor = isCritical ? '#ff7a17' : '#a0c3ec';

  // Compute jittered approximate positions for candidates
  const jitteredCandidates = useMemo(() => {
    return candidates.map((cand) => {
      const angle = hashStringToAngle(cand.id);
      const dist = parseApproximateDistanceToMeters(cand.approximateDistance);
      const [lat, lon] = offsetCoordinates(centerLat, centerLon, dist, angle);
      return {
        ...cand,
        cloakedLat: lat,
        cloakedLon: lon
      };
    });
  }, [candidates, centerLat, centerLon]);

  return (
    <div
      role="region"
      aria-label="Privacy-cloaked dispatch radar map"
      className="relative w-full h-[380px] bg-canvas rounded-lg overflow-hidden border border-hairline"
    >
      <MapContainer
        center={[centerLat, centerLon]}
        zoom={12}
        scrollWheelZoom={false}
        className="w-full h-full z-0"
      >
        {/* Dark CARTO Tiles with required OpenStreetMap and CARTO attribution */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        {/* Search Radius Circle */}
        <Circle
          center={[centerLat, centerLon]}
          radius={finalRadiusMeters}
          pathOptions={{
            color: circleColor,
            fillColor: circleColor,
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: '4, 4'
          }}
        />

        {/* Hospital Marker */}
        <Marker
          position={[centerLat, centerLon]}
          icon={createHospitalIcon(request.urgency)}
        >
          <Popup className="custom-leaflet-popup">
            <div className="font-sans text-xs p-1 space-y-1">
              <div className="font-bold text-[#ffffff]">Hospital Dispatch Center</div>
              <div className="font-mono text-[11px] text-[#dadbdf]">
                Need: {request.unitsRequired} units of {request.bloodGroup}
              </div>
              <div className="text-[10px] text-[#ff7a17] font-mono">
                Search Radius: {(finalRadiusMeters / 1000).toFixed(1)} km
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Jittered Anonymized Candidate Markers */}
        {jitteredCandidates.map((cand) => (
          <Marker
            key={cand.id}
            position={[cand.cloakedLat, cand.cloakedLon]}
            icon={createCandidateIcon(cand.responseStatus, cand.rank)}
          >
            <Popup className="custom-leaflet-popup">
              <div className="font-sans text-xs p-1 space-y-1">
                <div className="font-mono font-bold text-[#ffffff]">
                  Candidate #{cand.rank} ({cand.bloodGroup})
                </div>
                <div className="text-[11px] text-[#dadbdf]">
                  Status:{' '}
                  <span className="font-mono uppercase font-medium">
                    {cand.responseStatus.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-[11px] text-[#dadbdf]">
                  Approx Distance: <span className="font-mono">{cand.approximateDistance}</span>
                </div>
                <div className="text-[10px] text-[#7d8187] italic border-t border-[#212327] pt-1">
                  Cloaked location (+-1 km). Exact coordinates are never shared.
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[400] bg-canvas/90 backdrop-blur-sm border border-hairline rounded px-3 py-2 text-[11px] font-mono space-y-1 shadow-lg pointer-events-none">
        <div className="text-body-mid font-medium">RADAR PRIVACY BOUNDARY</div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border border-primary bg-canvas" />
          <span className="text-canvas-fg">Hospital Origin</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-sunset" />
          <span className="text-canvas-fg">Accepted Volunteer</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border border-hairline bg-canvas-soft" />
          <span className="text-body-mid">Notified Candidate (Cloaked)</span>
        </div>
      </div>
    </div>
  );
}

export default PrivacySafeMap;
