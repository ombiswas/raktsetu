import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { apiClient } from '../../lib/api/client.js';
import type { AnalyticsOverviewData } from './analytics-types.js';

interface StatusRow {
  status: string;
  count: number;
  percentage: string;
  description: string;
}

interface BenchmarkRow {
  metric: string;
  observed: string;
  target: string;
  statusVariant: 'success' | 'urgent' | 'info';
  statusLabel: string;
}

export function AnalyticsPage(): React.ReactElement {
  const [data, setData] = useState<AnalyticsOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.get<AnalyticsOverviewData>('/api/v1/analytics/overview');
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch operational analytics';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const statusRows: StatusRow[] = data
    ? [
        {
          status: 'FULFILLED',
          count: data.requestsByStatus.fulfilled,
          percentage: `${data.requestsByStatus.total > 0 ? ((data.requestsByStatus.fulfilled / data.requestsByStatus.total) * 100).toFixed(1) : 0}%`,
          description: 'Emergency blood units successfully collected and received by hospital.'
        },
        {
          status: 'MATCHING',
          count: data.requestsByStatus.matching,
          percentage: `${data.requestsByStatus.total > 0 ? ((data.requestsByStatus.matching / data.requestsByStatus.total) * 100).toFixed(1) : 0}%`,
          description: 'Active candidate batches notifying donors in progressive search rings.'
        },
        {
          status: 'OPEN',
          count: data.requestsByStatus.open,
          percentage: `${data.requestsByStatus.total > 0 ? ((data.requestsByStatus.open / data.requestsByStatus.total) * 100).toFixed(1) : 0}%`,
          description: 'Newly created emergency requests queued for geo-matching.'
        },
        {
          status: 'EXPIRED',
          count: data.requestsByStatus.expired,
          percentage: `${data.requestsByStatus.total > 0 ? ((data.requestsByStatus.expired / data.requestsByStatus.total) * 100).toFixed(1) : 0}%`,
          description: 'Target need-by deadline elapsed without full donor collection.'
        },
        {
          status: 'CANCELLED',
          count: data.requestsByStatus.cancelled,
          percentage: `${data.requestsByStatus.total > 0 ? ((data.requestsByStatus.cancelled / data.requestsByStatus.total) * 100).toFixed(1) : 0}%`,
          description: 'Hospital cancelled request before complete batch dispatch.'
        }
      ]
    : [];

  const statusColumns: Column<StatusRow>[] = [
    {
      key: 'status',
      header: 'REQUEST STATUS',
      render: (row) => (
        <Badge
          variant={
            row.status === 'FULFILLED'
              ? 'success'
              : row.status === 'MATCHING'
              ? 'urgent'
              : 'neutral'
          }
        >
          {row.status}
        </Badge>
      )
    },
    {
      key: 'count',
      header: 'VOLUME (COUNT)',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-bold text-canvas-fg">{row.count}</span>
      )
    },
    {
      key: 'percentage',
      header: 'RATIO',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-body-mid">{row.percentage}</span>
      )
    },
    {
      key: 'description',
      header: 'CLINICAL CONTEXT',
      render: (row) => (
        <span className="text-xs text-body-mid font-mono">{row.description}</span>
      )
    }
  ];

  const benchmarkRows: BenchmarkRow[] = data
    ? [
        {
          metric: 'Donor Response Rate',
          observed: `${(data.responseRate * 100).toFixed(1)}%`,
          target: '> 70.0%',
          statusVariant: data.responseRate >= 0.7 ? 'success' : 'urgent',
          statusLabel: data.responseRate >= 0.7 ? 'HEALTHY' : 'ATTENTION'
        },
        {
          metric: 'Median Time to First Accept',
          observed: `${Math.round(data.medianTimeToFirstAcceptSeconds)}s (${(data.medianTimeToFirstAcceptSeconds / 60).toFixed(1)}m)`,
          target: '< 300s (5.0m)',
          statusVariant: data.medianTimeToFirstAcceptSeconds <= 300 ? 'success' : 'urgent',
          statusLabel: data.medianTimeToFirstAcceptSeconds <= 300 ? 'RAPID' : 'DELAYED'
        },
        {
          metric: 'Request Fulfilment Rate',
          observed: `${(data.fulfillmentRate * 100).toFixed(1)}%`,
          target: '> 80.0%',
          statusVariant: data.fulfillmentRate >= 0.8 ? 'success' : 'urgent',
          statusLabel: data.fulfillmentRate >= 0.8 ? 'OPTIMAL' : 'BELOW TARGET'
        },
        {
          metric: 'Radius Expansion Frequency',
          observed: `${(data.radiusExpansionFrequency * 100).toFixed(1)}%`,
          target: '< 40.0%',
          statusVariant: data.radiusExpansionFrequency <= 0.4 ? 'info' : 'urgent',
          statusLabel: data.radiusExpansionFrequency <= 0.4 ? 'CONTAINED' : 'HIGH DISPERSION'
        },
        {
          metric: 'Degraded Mode Proximity Fallback',
          observed: `${(data.degradedRunRate * 100).toFixed(1)}%`,
          target: '< 5.0%',
          statusVariant: data.degradedRunRate <= 0.05 ? 'success' : 'urgent',
          statusLabel: data.degradedRunRate <= 0.05 ? 'RESILIENT' : 'ML DEGRADED'
        }
      ]
    : [];

  const benchmarkColumns: Column<BenchmarkRow>[] = [
    {
      key: 'metric',
      header: 'OPERATIONAL METRIC',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-canvas-fg">{row.metric}</span>
      )
    },
    {
      key: 'observed',
      header: 'OBSERVED VALUE',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-sm font-bold text-accent-sunset">{row.observed}</span>
      )
    },
    {
      key: 'target',
      header: 'BENCHMARK TARGET',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs text-body-mid">{row.target}</span>
      )
    },
    {
      key: 'status',
      header: 'OPERATIONAL STATUS',
      align: 'center',
      render: (row) => (
        <Badge variant={row.statusVariant}>
          {row.statusLabel}
        </Badge>
      )
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <Eyebrow variant="sunset" className="mb-1">
            RESEARCH BENCHMARK OVERVIEW
          </Eyebrow>
          <h1 className="text-2xl font-bold text-canvas-fg tracking-tight">
            Operational Dispatch & Matching Analytics
          </h1>
          <p className="text-xs text-body-mid mt-1">
            Quantified evaluation metrics for candidate responsiveness, time-to-first-accept, radius ring expansions, and degraded fallback frequency.
          </p>
        </div>

        <Button variant="outline-sm" onClick={fetchAnalytics} disabled={isLoading}>
          Refresh Metrics
        </Button>
      </div>

      {/* Mandatory Simulation Warning Notice */}
      <div className="p-4 bg-canvas-card border border-accent-sunset/30 rounded flex items-start gap-3 text-xs font-mono">
        <span className="w-2 h-2 rounded-full bg-accent-sunset mt-1 shrink-0" />
        <div className="space-y-1">
          <div className="font-bold text-accent-sunset">
            SIMULATION DATA (RESEARCH EVALUATION HARNESS)
          </div>
          <p className="text-body-mid">
            All operational statistics displayed on this dashboard originate from synthetic seed generators and college research benchmark runs. They demonstrate algorithmic efficiency and fail-safe mechanics, not real-world clinical performance.
          </p>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" label="Aggregating operational analytics..." />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="p-6 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-center text-accent-sunset space-y-3"
        >
          <div className="font-bold">Error loading analytics overview</div>
          <p className="text-xs text-body-mid">{error}</p>
          <Button variant="outline-sm" onClick={fetchAnalytics}>
            Retry
          </Button>
        </div>
      ) : data ? (
        <>
          {/* Stat Cards with Mono Labels and Large Display Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-1">
                <span className="text-[11px] font-mono text-body-mid uppercase tracking-wider">
                  RESPONSE RATE
                </span>
                <div className="text-4xl font-extrabold font-mono text-canvas-fg mt-2">
                  {(data.responseRate * 100).toFixed(1)}
                  <span className="text-lg text-body-mid font-normal ml-1">%</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-body-mid">
                Candidate positive or negative responses across all notifications.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <span className="text-[11px] font-mono text-body-mid uppercase tracking-wider">
                  MEDIAN TIME TO FIRST ACCEPT
                </span>
                <div className="text-4xl font-extrabold font-mono text-accent-sunset mt-2">
                  {Math.round(data.medianTimeToFirstAcceptSeconds)}
                  <span className="text-lg text-body-mid font-normal ml-1">sec</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-body-mid">
                Median elapsed time between request creation and initial donor acceptance.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <span className="text-[11px] font-mono text-body-mid uppercase tracking-wider">
                  FULFILMENT RATE
                </span>
                <div className="text-4xl font-extrabold font-mono text-canvas-fg mt-2">
                  {(data.fulfillmentRate * 100).toFixed(1)}
                  <span className="text-lg text-body-mid font-normal ml-1">%</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-body-mid">
                Percentage of emergency requests that met 100% required units.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <span className="text-[11px] font-mono text-body-mid uppercase tracking-wider">
                  RADIUS EXPANSIONS
                </span>
                <div className="text-4xl font-extrabold font-mono text-canvas-fg mt-2">
                  {(data.radiusExpansionFrequency * 100).toFixed(1)}
                  <span className="text-lg text-body-mid font-normal ml-1">%</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-body-mid">
                Runs requiring step expansion due to sparse local candidate pools.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <span className="text-[11px] font-mono text-body-mid uppercase tracking-wider">
                  DEGRADED PROXIMITY RUNS
                </span>
                <div className="text-4xl font-extrabold font-mono text-accent-info mt-2">
                  {(data.degradedRunRate * 100).toFixed(1)}
                  <span className="text-lg text-body-mid font-normal ml-1">%</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-body-mid">
                Match runs executing deterministic proximity fallback without ML inference.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <span className="text-[11px] font-mono text-body-mid uppercase tracking-wider">
                  TOTAL NOTIFICATIONS
                </span>
                <div className="text-4xl font-extrabold font-mono text-canvas-fg mt-2">
                  {data.totalNotifications}
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-body-mid">
                Cumulative dispatch notifications delivered to eligible donors.
              </CardContent>
            </Card>
          </div>

          {/* Tables Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Table 1: Performance Benchmarks */}
            <Card>
              <CardHeader>
                <CardTitle>Matching Engine Key Performance Indicators</CardTitle>
                <CardDescription>
                  Evaluated across {data.totalMatchRuns} simulation runs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={benchmarkColumns}
                  data={benchmarkRows}
                  keyExtractor={(row) => row.metric}
                />
              </CardContent>
            </Card>

            {/* Table 2: Request Lifecycle Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Emergency Request Lifecycle Breakdown</CardTitle>
                <CardDescription>
                  Total volume: {data.requestsByStatus.total} emergency blood requests.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={statusColumns}
                  data={statusRows}
                  keyExtractor={(row) => row.status}
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default AnalyticsPage;
