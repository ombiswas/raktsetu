import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Toast } from '../../components/ui/Toast.js';

interface DonorAlert {
  id: string;
  hospitalName: string;
  bloodGroup: string;
  approxDistanceKm: number;
  urgency: string;
  expiresInMinutes: number;
}

const SAMPLE_ALERTS: DonorAlert[] = [
  {
    id: 'alert-882',
    hospitalName: 'Apollo Trauma Care Center',
    bloodGroup: 'O+',
    approxDistanceKm: 3.5,
    urgency: 'CRITICAL',
    expiresInMinutes: 8
  }
];

export function DonorPage(): React.ReactElement {
  const [isAvailable, setIsAvailable] = useState(true);
  const [alerts, setAlerts] = useState<DonorAlert[]>(SAMPLE_ALERTS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleAcceptAlert = (alert: DonorAlert) => {
    setAlerts(alerts.filter((a) => a.id !== alert.id));
    setToastMessage(
      `Accepted alert for ${alert.hospitalName}. Contact telephone coordinates revealed to hospital logistics.`
    );
  };

  const handleDeclineAlert = (alert: DonorAlert) => {
    setAlerts(alerts.filter((a) => a.id !== alert.id));
    setToastMessage(`Alert declined. Fatigue penalty decayed in priority queue.`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast
            title="Donor Response Recorded"
            description={toastMessage}
            variant="info"
            onDismiss={() => setToastMessage(null)}
          />
        </div>
      )}

      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Eyebrow size="sm">VOLUNTEER DONOR PORTAL</Eyebrow>
          <h1 className="text-2xl font-normal text-[#ffffff] tracking-tight">
            Donor Availability & Emergency Alerts
          </h1>
          <p className="text-xs text-[#7d8187] mt-1">
            Exact GPS coordinates are never stored in plain text or broadcast to hospitals.
          </p>
        </div>

        <Button
          variant={isAvailable ? 'primary' : 'outline'}
          onClick={() => setIsAvailable(!isAvailable)}
        >
          <span
            className={`w-2 h-2 rounded-full mr-2 ${
              isAvailable ? 'bg-emerald-400' : 'bg-[#ff7a17]'
            }`}
          />
          {isAvailable ? 'Availability: Active' : 'Availability: Paused'}
        </Button>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <Eyebrow size="sm" className="mb-1">
            CLINICAL COOLDOWN
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">Eligible</div>
          <p className="text-xs text-[#7d8187]">112 days since last whole blood donation (statutory min: 90 days)</p>
        </Card>

        <Card>
          <Eyebrow size="sm" className="mb-1">
            REGISTERED GROUP
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">O Positive (O+)</div>
          <p className="text-xs text-[#7d8187]">Compatible recipient pool: O+, A+, B+, AB+</p>
        </Card>

        <Card>
          <Eyebrow size="sm" className="mb-1">
            FATIGUE INDEX
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">Low (0.12)</div>
          <p className="text-xs text-[#7d8187]">1 notification in the last 7 days; burnout penalty: 0</p>
        </Card>
      </div>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow variant="sunset" size="sm">
                RING-FENCED EMERGENCY ALERTS
              </Eyebrow>
              <CardTitle>Incoming Emergency Requests</CardTitle>
            </div>
            {alerts.length > 0 && (
              <Badge variant="urgent" dot>
                {alerts.length} URGENT
              </Badge>
            )}
          </div>
          <CardDescription>
            You were selected because you satisfy all deterministic biological criteria and match proximity
            and response likelihood models.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#7d8187]">
              No active emergency dispatch alerts at this time. Thank you for staying ready.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-4 rounded-[8px] bg-[#1a1c20] border border-[#212327] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-normal text-[#ffffff]">
                        {alert.hospitalName}
                      </span>
                      <Badge variant="urgent">CRITICAL NEED</Badge>
                    </div>
                    <div className="text-xs text-[#7d8187] flex items-center gap-3 font-mono">
                      <span>Approx. ~{alert.approxDistanceKm} km away</span>
                      <span>·</span>
                      <span className="text-[#ffc285]">Expires in {alert.expiresInMinutes} mins</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline-sm"
                      onClick={() => handleDeclineAlert(alert)}
                    >
                      Decline
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleAcceptAlert(alert)}
                    >
                      Accept & Reveal Contact
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DonorPage;
