import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import type { MatchingCandidate } from './request-types.js';

interface AcceptedDonorsPanelProps {
  candidates: MatchingCandidate[];
}

export function AcceptedDonorsPanel({ candidates }: AcceptedDonorsPanelProps): React.ReactElement {
  const acceptedDonors = candidates.filter((c) => c.responseStatus === 'accepted');

  return (
    <Card className="border-accent-sunset/30 bg-canvas-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow variant="sunset" size="sm">CONFIRMED LOGISTICS</Eyebrow>
            <CardTitle>Accepted Voluntary Donors</CardTitle>
            <CardDescription>
              Direct contact details for voluntary coordination. Revealed only upon explicit donor consent.
            </CardDescription>
          </div>
          <Badge variant={acceptedDonors.length > 0 ? 'urgent' : 'neutral'} dot={acceptedDonors.length > 0}>
            {acceptedDonors.length} ACCEPTED
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Immutable Audit Log Disclaimer Notice */}
        <div
          role="note"
          aria-label="Contact disclosure audit policy"
          className="mb-4 p-3 bg-canvas-soft border border-hairline rounded text-xs text-body-mid space-y-1"
        >
          <div className="flex items-center gap-1.5 font-mono text-xs text-accent-sunset font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            AUDITED ACCESS LOGGING ACTIVE
          </div>
          <p>
            Donor phone numbers and identities are strictly cloaked during matching. Accessing donor contact
            details is logged immutably in the hospital research audit trail with actor ID and timestamp.
          </p>
        </div>

        {acceptedDonors.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-hairline rounded-lg space-y-2">
            <div className="font-mono text-sm text-body-mid">Awaiting Volunteer Acceptance</div>
            <p className="text-xs text-body-mid max-w-md mx-auto">
              Compatible candidates have been alerted in Tier 1. Once a donor accepts the emergency dispatch,
              their first name and direct phone number will unlock here instantly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {acceptedDonors.map((donor) => (
              <div
                key={donor.id}
                className="p-4 bg-canvas-soft border border-hairline rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between border-b border-hairline pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-accent-sunset text-on-primary font-mono text-xs font-bold flex items-center justify-center">
                      #{donor.rank}
                    </span>
                    <span className="font-medium text-canvas-fg text-sm">
                      {donor.firstName || 'Voluntary Donor'}
                    </span>
                  </div>
                  <Badge variant="urgent" dot>
                    ACCEPTED
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-body-mid">BLOOD GROUP:</span>
                    <span className="text-canvas-fg font-bold">{donor.bloodGroup}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body-mid">APPROX DISTANCE:</span>
                    <span className="text-canvas-fg">{donor.approximateDistance}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-hairline">
                    <span className="text-body-mid">PHONE:</span>
                    {donor.phone ? (
                      <a
                        href={`tel:${donor.phone}`}
                        className="text-accent-sunset hover:underline font-bold text-sm tracking-wide"
                      >
                        {donor.phone}
                      </a>
                    ) : (
                      <span className="text-body-mid italic">Revealed to Hospital</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AcceptedDonorsPanel;
