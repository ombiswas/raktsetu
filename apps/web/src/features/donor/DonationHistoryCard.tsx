import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api/index.js';
import type { DonationHistoryItem } from './donor-types.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';

export function DonationHistoryCard(): React.ReactElement {
  const [donations, setDonations] = useState<DonationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadDonations() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await apiFetch<{ donations: DonationHistoryItem[] }>('/api/v1/donors/me/donations');
        if (isMounted) {
          setDonations(res.donations || []);
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Could not load donation history.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadDonations();
    return () => {
      isMounted = false;
    };
  }, []);

  const columns: Column<DonationHistoryItem>[] = [
    {
      key: 'donatedAt',
      header: 'DATE',
      className: 'font-mono text-xs',
      render: (item) => new Date(item.donatedAt).toLocaleDateString()
    },
    {
      key: 'bloodBankName',
      header: 'BLOOD BANK / FACILITY',
      render: (item) => <span className="font-medium text-canvas-fg">{item.bloodBankName}</span>
    },
    {
      key: 'units',
      header: 'UNITS',
      align: 'right',
      className: 'font-mono text-xs text-right',
      render: (item) => `${item.units} unit(s)`
    }
  ];

  return (
    <Card>
      <CardHeader>
        <Eyebrow size="sm">AUDIT TRAIL</Eyebrow>
        <CardTitle>Verified Whole Blood & Apheresis History</CardTitle>
        <CardDescription>
          Recorded donations officially verified by licensed regional blood banks. Each completed donation resets your statutory 90-day cooldown counter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton variant="text" className="w-full h-8" />
            <Skeleton variant="text" className="w-full h-8" />
            <Skeleton variant="text" className="w-full h-8" />
          </div>
        ) : errorMessage ? (
          <div
            role="alert"
            className="p-3 bg-sunset-edge/10 border border-sunset-edge/40 rounded-lg text-xs font-mono text-sunset-glow"
          >
            {errorMessage}
          </div>
        ) : donations.length === 0 ? (
          <EmptyState
            title="No Verified Donations Recorded"
            description="Your donation record is currently empty. Once a transfusion center logs your successful donation, it will appear here."
          />
        ) : (
          <DataTable
            data={donations}
            columns={columns}
            keyExtractor={(item) => item.id}
            emptyMessage="No verified volunteer blood donations recorded."
          />
        )}
      </CardContent>
    </Card>
  );
}
