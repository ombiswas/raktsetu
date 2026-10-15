import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { Select } from '../../components/ui/Select.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { apiClient } from '../../lib/api/client.js';
import type { AuditLogItem, AuditLogsResponse } from './admin-types.js';

const ENTITY_OPTIONS = [
  { label: 'All Entities', value: 'all' },
  { label: 'Blood Requests (blood_requests)', value: 'blood_requests' },
  { label: 'Blood Banks (blood_banks)', value: 'blood_banks' },
  { label: 'Hospitals (hospitals)', value: 'hospitals' },
  { label: 'Donors (donors)', value: 'donors' },
  { label: 'User Accounts (users)', value: 'users' },
  { label: 'Inventory (inventory)', value: 'inventory' }
];

export function AuditLogViewer(): React.ReactElement {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [limit, setLimit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);

  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (entityFilter !== 'all') {
        params.set('entity', entityFilter);
      }
      if (actionFilter.trim()) {
        params.set('action', actionFilter.trim());
      }
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await apiClient.get<AuditLogsResponse>(
        `/api/v1/admin/audit-logs?${params.toString()}`
      );
      setLogs(res.items || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch audit log trail';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [entityFilter, actionFilter, limit, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handlePrevPage = () => {
    if (offset >= limit) {
      setOffset(offset - limit);
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  const handleResetFilters = () => {
    setEntityFilter('all');
    setActionFilter('');
    setOffset(0);
  };

  const columns: Column<AuditLogItem>[] = [
    {
      key: 'createdAt',
      header: 'TIMESTAMP (UTC)',
      render: (log) => (
        <span className="font-mono text-xs text-body-mid">
          {new Date(log.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
        </span>
      )
    },
    {
      key: 'action',
      header: 'AUDITED ACTION',
      render: (log) => {
        const isUrgent = log.action.includes('suspend') || log.action.includes('deferred');
        const isSuccess = log.action.includes('approve') || log.action.includes('fulfilled');
        return (
          <Badge variant={isUrgent ? 'urgent' : isSuccess ? 'success' : 'info'}>
            {log.action}
          </Badge>
        );
      }
    },
    {
      key: 'entity',
      header: 'TARGET ENTITY:ID',
      render: (log) => (
        <div className="font-mono text-xs">
          <span className="text-canvas-fg font-semibold">{log.entity}:</span>
          <span className="text-body-mid ml-1 truncate inline-block max-w-[120px] align-bottom">
            {log.entityId}
          </span>
        </div>
      )
    },
    {
      key: 'actorUserId',
      header: 'ACTOR USER ID',
      render: (log) => (
        <span className="font-mono text-xs text-body-mid truncate inline-block max-w-[110px]">
          {log.actorUserId ?? 'System / Daemon'}
        </span>
      )
    },
    {
      key: 'ipHash',
      header: 'IP HASH (HMAC)',
      render: (log) => (
        <span className="font-mono text-[11px] text-body-mid truncate inline-block max-w-[100px]" title={log.ipHash ?? 'N/A'}>
          {log.ipHash ? `${log.ipHash.slice(0, 10)}…` : '—'}
        </span>
      )
    },
    {
      key: 'metadata',
      header: 'METADATA',
      align: 'right',
      render: (log) => {
        const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
        const isExpanded = expandedLogId === log.id;

        if (!hasMetadata) {
          return <span className="text-xs text-body-mid font-mono">—</span>;
        }

        return (
          <div className="flex flex-col items-end">
            <Button
              variant="outline-sm"
              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
            >
              {isExpanded ? 'Hide Payload' : 'View Payload'}
            </Button>
            {isExpanded && (
              <pre className="mt-2 p-2 bg-canvas-card border border-hairline rounded text-[10px] font-mono text-left text-canvas-fg max-w-xs overflow-x-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle>System Audit Trail (Read-Only)</CardTitle>
          <CardDescription>
            Immutable event journal recording user authentications, medical deferrals, approvals, and dispatch actions.
          </CardDescription>
        </div>

        {/* Read-Only Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="neutral">APPEND-ONLY DB</Badge>
          <Button variant="outline-sm" onClick={fetchLogs} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-canvas-card border border-hairline rounded">
          <Select
            label="Entity Filter"
            options={ENTITY_OPTIONS}
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setOffset(0);
            }}
          />

          <TextInput
            label="Action Filter"
            placeholder="e.g. admin.account.approve"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setOffset(0);
            }}
          />

          <div className="flex items-end gap-2 pb-0.5">
            <div className="flex-1">
              <Select
                label="Rows per page"
                options={[
                  { label: '10 rows', value: '10' },
                  { label: '20 rows', value: '20' },
                  { label: '50 rows', value: '50' }
                ]}
                value={String(limit)}
                onChange={(e) => {
                  setLimit(parseInt(e.target.value, 10));
                  setOffset(0);
                }}
              />
            </div>
            <Button variant="outline-sm" onClick={handleResetFilters}>
              Reset
            </Button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-xs text-accent-sunset"
          >
            {error}
          </div>
        )}

        {isLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" label="Querying immutable audit logs..." />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={logs}
            keyExtractor={(log) => log.id}
            emptyMessage="No audit log entries matching current search criteria."
          />
        )}

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs font-mono text-body-mid border-t border-hairline">
          <div>
            Showing {logs.length > 0 ? offset + 1 : 0}–{Math.min(offset + limit, total)} of {total} audit records
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline-sm"
              onClick={handlePrevPage}
              disabled={offset === 0 || isLoading}
            >
              Previous
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline-sm"
              onClick={handleNextPage}
              disabled={offset + limit >= total || isLoading}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
