import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { Select } from '../../components/ui/Select.js';
import { Modal } from '../../components/ui/Modal.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { apiClient } from '../../lib/api/client.js';
import type { AdminAccountSummary } from './admin-types.js';

export interface PendingAccountsQueueProps {
  onAccountStatusChanged?: () => void;
}

type ActionType = 'approve' | 'suspend' | 'reactivate';

interface ConfirmActionState {
  account: AdminAccountSummary;
  type: ActionType;
}

export function PendingAccountsQueue({ onAccountStatusChanged }: PendingAccountsQueueProps): React.ReactElement {
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (roleFilter !== 'all') {
        params.set('role', roleFilter);
      }
      params.set('limit', '100');

      const res = await apiClient.get<{ accounts: AdminAccountSummary[] }>(
        `/api/v1/admin/accounts?${params.toString()}`
      );
      setAccounts(res.accounts || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch accounts queue';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, roleFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleExecuteAction = async () => {
    if (!confirmAction) return;

    try {
      setIsSubmitting(true);
      setActionError(null);

      const { account, type } = confirmAction;
      await apiClient.post(`/api/v1/admin/accounts/${account.id}/${type}`, {});

      setConfirmAction(null);
      await fetchAccounts();
      if (onAccountStatusChanged) {
        onAccountStatusChanged();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to execute ${confirmAction.type} action`;
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<AdminAccountSummary>[] = [
    {
      key: 'account',
      header: 'ACCOUNT & ROLE',
      render: (acc) => (
        <div className="space-y-1">
          <div className="font-mono text-xs font-semibold text-canvas-fg">{acc.email}</div>
          <Badge variant={acc.role === 'admin' ? 'info' : acc.role === 'hospital' ? 'urgent' : 'neutral'}>
            {acc.role.toUpperCase()}
          </Badge>
        </div>
      )
    },
    {
      key: 'organization',
      header: 'IDENTIFIER / DETAILS',
      render: (acc) => {
        const d = acc.details;
        const name = d?.name || d?.fullName || '—';
        const licenseOrReg = d?.licenseNo ? `License: ${d.licenseNo}` : d?.registrationNo ? `Reg: ${d.registrationNo}` : null;
        const phone = d?.phone;

        return (
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-canvas-fg">{name}</div>
            {licenseOrReg && <div className="font-mono text-[11px] text-body-mid">{licenseOrReg}</div>}
            {phone && <div className="font-mono text-[11px] text-body-mid">Tel: {phone}</div>}
          </div>
        );
      }
    },
    {
      key: 'createdAt',
      header: 'REGISTERED AT',
      render: (acc) => (
        <span className="font-mono text-xs text-body-mid">
          {new Date(acc.createdAt).toLocaleDateString()} {new Date(acc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    },
    {
      key: 'status',
      header: 'STATUS',
      align: 'center',
      render: (acc) => (
        <Badge
          variant={
            acc.status === 'active'
              ? 'success'
              : acc.status === 'pending'
              ? 'urgent'
              : 'neutral'
          }
          dot={acc.status === 'pending'}
        >
          {acc.status.toUpperCase()}
        </Badge>
      )
    },
    {
      key: 'actions',
      header: 'MODERATION ACTION',
      align: 'right',
      render: (acc) => (
        <div className="flex items-center justify-end gap-2">
          {acc.status === 'pending' && (
            <Button
              variant="primary"
              onClick={() => setConfirmAction({ account: acc, type: 'approve' })}
            >
              Approve
            </Button>
          )}

          {acc.status === 'active' && acc.role !== 'admin' && (
            <Button
              variant="outline-sm"
              onClick={() => setConfirmAction({ account: acc, type: 'suspend' })}
            >
              Suspend
            </Button>
          )}

          {acc.status === 'suspended' && (
            <Button
              variant="outline-sm"
              onClick={() => setConfirmAction({ account: acc, type: 'reactivate' })}
            >
              Reactivate
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle>Account Moderation Queue</CardTitle>
          <CardDescription>
            Verify healthcare organizations and enforce administrative security actions.
          </CardDescription>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-36">
            <Select
              label="Status"
              options={[
                { label: 'Pending Only', value: 'pending' },
                { label: 'Active Only', value: 'active' },
                { label: 'Suspended Only', value: 'suspended' },
                { label: 'All Statuses', value: 'all' }
              ]}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>

          <div className="w-36">
            <Select
              label="Role"
              options={[
                { label: 'All Roles', value: 'all' },
                { label: 'Hospitals', value: 'hospital' },
                { label: 'Blood Banks', value: 'blood_bank' },
                { label: 'Donors', value: 'donor' }
              ]}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            />
          </div>

          <Button variant="outline-sm" onClick={fetchAccounts} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div
            role="alert"
            className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset mb-4"
          >
            {error}
          </div>
        )}

        {isLoading && accounts.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" label="Loading account queue..." />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={accounts}
            keyExtractor={(acc) => acc.id}
            emptyMessage={`No ${statusFilter === 'all' ? '' : statusFilter} accounts found matching current filters.`}
          />
        )}
      </CardContent>

      {/* Confirmation Modal for Actions */}
      {confirmAction && (
        <Modal
          isOpen={Boolean(confirmAction)}
          onClose={() => setConfirmAction(null)}
          title={
            confirmAction.type === 'approve'
              ? 'Approve Organization Account'
              : confirmAction.type === 'suspend'
              ? 'Suspend User Account (Destructive Action)'
              : 'Reactivate Suspended Account'
          }
          description={`Confirm administrative action on ${confirmAction.account.email}`}
          maxWidth="md"
          footer={
            <>
              <Button
                variant="outline-sm"
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleExecuteAction}
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                {confirmAction.type === 'approve'
                  ? 'Confirm Approval'
                  : confirmAction.type === 'suspend'
                  ? 'Confirm Suspension'
                  : 'Confirm Reactivation'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {actionError && (
              <div
                role="alert"
                className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset"
              >
                {actionError}
              </div>
            )}

            <div className="p-3 bg-canvas-card border border-hairline rounded font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-body-mid">Account Email:</span>
                <span className="text-canvas-fg font-bold">{confirmAction.account.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-body-mid">Account Role:</span>
                <span className="text-canvas-fg uppercase">{confirmAction.account.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-body-mid">Current Status:</span>
                <span className="text-accent-sunset uppercase font-bold">{confirmAction.account.status}</span>
              </div>
            </div>

            {confirmAction.type === 'approve' && (
              <div className="p-3 bg-canvas-card border border-hairline rounded text-xs text-body-mid">
                Approving this account certifies that licensing and facility credentials have been validated. The organization will immediately gain access to emergency blood dispatches.
              </div>
            )}

            {confirmAction.type === 'suspend' && (
              <div className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-sunset" />
                  WARNING: IMMEDIATE ACCESS REVOCATION
                </div>
                <p>
                  Suspending this account revokes all active refresh tokens and terminates active browser sessions. The user will be blocked from logging in.
                </p>
              </div>
            )}

            {confirmAction.type === 'reactivate' && (
              <div className="p-3 bg-canvas-card border border-hairline rounded text-xs text-body-mid">
                Reactivating restores system login privileges. The user will be able to sign in and initiate blood requests.
              </div>
            )}
          </div>
        </Modal>
      )}
    </Card>
  );
}
