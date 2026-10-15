import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { apiClient } from '../../lib/api/client.js';
import { AdjustStockModal } from './AdjustStockModal.js';
import { RecordDonationModal } from './RecordDonationModal.js';
import { DeferDonorModal } from './DeferDonorModal.js';
import type { InventoryData, InventoryItem, BloodGroup, BloodComponent } from './blood-bank-types.js';

function formatComponent(comp: BloodComponent): string {
  switch (comp) {
    case 'whole_blood':
      return 'Whole Blood (450ml)';
    case 'rbc':
      return 'Packed Red Blood Cells (RBC)';
    case 'plasma':
      return 'Fresh Frozen Plasma (FFP)';
    case 'platelets':
      return 'Platelet Concentrate';
    default:
      return comp;
  }
}

export function BloodBankPage(): React.ReactElement {
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState<boolean>(false);
  const [adjustPreselect, setAdjustPreselect] = useState<{ group?: BloodGroup; comp?: BloodComponent }>({});

  const [isRecordDonationOpen, setIsRecordDonationOpen] = useState<boolean>(false);
  const [isDeferModalOpen, setIsDeferModalOpen] = useState<boolean>(false);
  const [deferDonorId, setDeferDonorId] = useState<string>('');

  const fetchInventory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get<InventoryData>('/api/v1/blood-banks/me/inventory');
      setInventory(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load blood bank inventory';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleOpenAdjustForRow = (item: InventoryItem) => {
    setAdjustPreselect({ group: item.bloodGroup, comp: item.component });
    setIsAdjustModalOpen(true);
  };

  const handleOpenDeferFromDonation = (donorId: string) => {
    setIsRecordDonationOpen(false);
    setDeferDonorId(donorId);
    setIsDeferModalOpen(true);
  };

  const columns: Column<InventoryItem>[] = [
    {
      key: 'bloodGroup',
      header: 'BLOOD GROUP',
      render: (item) => (
        <span className="font-mono font-bold text-sm text-canvas-fg">
          {item.bloodGroup}
        </span>
      )
    },
    {
      key: 'component',
      header: 'COMPONENT',
      render: (item) => (
        <span className="text-xs text-body-mid font-mono">
          {formatComponent(item.component)}
        </span>
      )
    },
    {
      key: 'units',
      header: 'ON HAND (UNITS)',
      align: 'right',
      render: (item) => (
        <span className="font-mono font-bold text-sm text-canvas-fg">
          {item.units} <span className="text-body-mid text-xs font-normal">units</span>
        </span>
      )
    },
    {
      key: 'threshold',
      header: 'THRESHOLD',
      align: 'right',
      render: (item) => (
        <span className="font-mono text-xs text-body-mid">
          {item.lowStockThreshold} units
        </span>
      )
    },
    {
      key: 'status',
      header: 'STOCK STATUS',
      align: 'center',
      render: (item) => (
        <Badge
          variant={item.isLowStock ? 'urgent' : 'success'}
          dot={item.isLowStock}
        >
          {item.isLowStock ? 'LOW STOCK' : 'ADEQUATE'}
        </Badge>
      )
    },
    {
      key: 'updatedAt',
      header: 'LAST UPDATED',
      render: (item) => (
        <span className="font-mono text-xs text-body-mid">
          {new Date(item.updatedAt).toLocaleDateString()} {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'ACTION',
      align: 'right',
      render: (item) => (
        <Button
          variant="outline-sm"
          onClick={() => handleOpenAdjustForRow(item)}
        >
          Adjust
        </Button>
      )
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <Eyebrow variant="sunset" className="mb-1">
            REGIONAL BLOOD CENTER OPS
          </Eyebrow>
          <h1 className="text-2xl font-bold text-canvas-fg tracking-tight">
            Blood Bank Inventory & Clinical Hub
          </h1>
          <p className="text-xs text-body-mid mt-1">
            Monitor real-time unit levels, record voluntary donations, and manage clinical safety deferrals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setAdjustPreselect({});
              setIsAdjustModalOpen(true);
            }}
          >
            Adjust Stock
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setDeferDonorId('');
              setIsDeferModalOpen(true);
            }}
          >
            Defer Donor
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsRecordDonationOpen(true)}
          >
            + Record Donation
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Total Available Units</span>
            <div className="text-3xl font-bold text-canvas-fg font-mono mt-1">
              {inventory ? inventory.totalUnits : '—'}
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Aggregated across all blood groups and components.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Low Stock Alerts</span>
            <div className="text-3xl font-bold font-mono mt-1 text-accent-sunset">
              {inventory ? inventory.lowStockCount : '—'}
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Groups currently below baseline buffer thresholds.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Buffer Threshold</span>
            <div className="text-3xl font-bold text-canvas-fg font-mono mt-1">
              10 <span className="text-xs font-normal text-body-mid">units</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Automated threshold trigger for hospital dispatch.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Clinical Integrity</span>
            <div className="text-xs font-mono font-bold text-accent-info mt-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-info" />
              DETERMINISTIC COOLDOWN ACTIVE
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Donation logs atomically enforce mandatory donation intervals.
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Verified Stock by Component & Group</CardTitle>
            <CardDescription>
              Inventory levels available to emergency matching runs. Updated atomically with donation collections.
            </CardDescription>
          </div>
          <Button variant="outline-sm" onClick={fetchInventory} disabled={isLoading}>
            Refresh
          </Button>
        </CardHeader>

        <CardContent>
          {error && (
            <div
              role="alert"
              className="p-4 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-sm text-accent-sunset mb-4"
            >
              {error}
            </div>
          )}

          {isLoading && !inventory ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" label="Loading blood bank inventory..." />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={inventory?.items ?? []}
              keyExtractor={(item) => item.id}
              emptyMessage="No inventory rows found. Adjust stock or record a donation to initialize inventory."
            />
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <AdjustStockModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        onSuccess={fetchInventory}
        defaultBloodGroup={adjustPreselect.group}
        defaultComponent={adjustPreselect.comp}
      />

      <RecordDonationModal
        isOpen={isRecordDonationOpen}
        onClose={() => setIsRecordDonationOpen(false)}
        onSuccess={fetchInventory}
        onOpenDeferModal={handleOpenDeferFromDonation}
      />

      <DeferDonorModal
        isOpen={isDeferModalOpen}
        onClose={() => setIsDeferModalOpen(false)}
        onSuccess={fetchInventory}
        initialDonorId={deferDonorId}
      />
    </div>
  );
}

export default BloodBankPage;
