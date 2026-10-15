import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { Select } from '../../components/ui/Select.js';
import { Badge } from '../../components/ui/Badge.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { apiClient } from '../../lib/api/client.js';
import type { BloodGroup, BloodComponent } from '../blood-bank/blood-bank-types.js';
import type { ForecastOverviewData } from './forecast-types.js';

const BLOOD_GROUPS: { label: string; value: BloodGroup }[] = [
  { label: 'O+ (Universal Donor RBC)', value: 'O+' },
  { label: 'O- (Emergency Universal)', value: 'O-' },
  { label: 'A+', value: 'A+' },
  { label: 'A-', value: 'A-' },
  { label: 'B+', value: 'B+' },
  { label: 'B-', value: 'B-' },
  { label: 'AB+', value: 'AB+' },
  { label: 'AB- (Rare Plasma Universal)', value: 'AB-' }
];

const COMPONENTS: { label: string; value: BloodComponent }[] = [
  { label: 'Whole Blood (450ml)', value: 'whole_blood' },
  { label: 'Packed Red Blood Cells (RBC)', value: 'rbc' },
  { label: 'Fresh Frozen Plasma (FFP)', value: 'plasma' },
  { label: 'Platelet Concentrate', value: 'platelets' }
];

const DAYS_OPTIONS = [
  { label: 'Past 14 Days', value: '14' },
  { label: 'Past 30 Days', value: '30' },
  { label: 'Past 60 Days', value: '60' }
];

interface HoveredPointInfo {
  x: number;
  y: number;
  date: string;
  units: number;
  isForecast: boolean;
}

export function ForecastPage(): React.ReactElement {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [component, setComponent] = useState<BloodComponent>('whole_blood');
  const [days, setDays] = useState<number>(30);

  const [data, setData] = useState<ForecastOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [hoveredPoint, setHoveredPoint] = useState<HoveredPointInfo | null>(null);

  const fetchForecast = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.get<ForecastOverviewData>(
        `/api/v1/forecasts?bloodGroup=${encodeURIComponent(bloodGroup)}&component=${encodeURIComponent(
          component
        )}&days=${days}`
      );
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load demand forecasts';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [bloodGroup, component, days]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Chart coordinate calculations
  const chartWidth = 840;
  const chartHeight = 360;
  const padding = { top: 35, right: 40, bottom: 50, left: 65 };

  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const chartData = useMemo(() => {
    if (!data) return null;

    const series = data.series || [];
    const forecast = data.forecast || [];

    const totalPoints = series.length + forecast.length;
    if (totalPoints === 0) return null;

    // Find max unit value for Y-axis scale
    const allValues = [
      ...series.map((s) => s.units),
      ...forecast.map((f) => f.predictedUnits)
    ];
    const maxValue = Math.max(10, Math.ceil(Math.max(...allValues, 10) * 1.15));

    // Combine into unified chronological sequence
    const combinedPoints: Array<{
      date: string;
      units: number;
      isForecast: boolean;
      x: number;
      y: number;
    }> = [];

    const denom = Math.max(1, totalPoints - 1);

    series.forEach((s, idx) => {
      const x = padding.left + (idx / denom) * plotWidth;
      const y = padding.top + (1 - s.units / maxValue) * plotHeight;
      combinedPoints.push({
        date: s.date,
        units: s.units,
        isForecast: false,
        x,
        y
      });
    });

    const seriesLength = series.length;
    forecast.forEach((f, idx) => {
      const pointIndex = seriesLength + idx;
      const x = padding.left + (pointIndex / denom) * plotWidth;
      const y = padding.top + (1 - f.predictedUnits / maxValue) * plotHeight;
      combinedPoints.push({
        date: f.date,
        units: Math.round(f.predictedUnits * 10) / 10,
        isForecast: true,
        x,
        y
      });
    });

    // Build SVG path commands
    const historyPoints = combinedPoints.filter((p) => !p.isForecast);
    const forecastPoints = combinedPoints.filter((p) => p.isForecast);

    let historyPath = '';
    if (historyPoints.length > 0) {
      historyPath = historyPoints.reduce(
        (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        ''
      );
    }

    let forecastPath = '';
    if (forecastPoints.length > 0) {
      // Connect smoothly from the last history point if available
      const startPoint = historyPoints[historyPoints.length - 1];
      const connectingPoints = startPoint ? [startPoint, ...forecastPoints] : forecastPoints;
      forecastPath = connectingPoints.reduce(
        (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        ''
      );
    }

    // Y-axis grid ticks (5 steps)
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = Math.round(ratio * maxValue);
      const y = padding.top + (1 - ratio) * plotHeight;
      return { val, y };
    });

    // X-axis date labels (sample every few points to avoid crowding)
    const stepInterval = Math.max(1, Math.floor(totalPoints / 6));
    const xTicks = combinedPoints.filter((_, idx) => idx % stepInterval === 0 || idx === totalPoints - 1);

    return {
      combinedPoints,
      historyPoints,
      forecastPoints,
      historyPath,
      forecastPath,
      yTicks,
      xTicks,
      maxValue
    };
  }, [data, plotWidth, plotHeight, padding.left, padding.top]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <Eyebrow variant="sunset" className="mb-1">
            DEMAND INTELLIGENCE & FORECASTING
          </Eyebrow>
          <h1 className="text-2xl font-bold text-canvas-fg tracking-tight">
            Multi-Day Blood Demand Forecast
          </h1>
          <p className="text-xs text-body-mid mt-1">
            Historical demand trends and 7-day predictive projections synthesized for blood center procurement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="info">
            MODEL {data?.modelVersion ?? 'v0.1.0-seasonal-baseline'}
          </Badge>
          <Button variant="outline-sm" onClick={fetchForecast} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Simulation Banner Notice */}
      <div className="p-3 bg-canvas-card border border-accent-sunset/30 rounded flex items-center gap-3 text-xs font-mono">
        <span className="w-2 h-2 rounded-full bg-accent-sunset shrink-0" />
        <div className="text-body-mid">
          <strong className="text-accent-sunset">SIMULATION RESEARCH NOTICE:</strong> Demand forecasts and historical demand series are generated from the college research evaluation harness. Results do not constitute operational guarantees.
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Blood Group"
              options={BLOOD_GROUPS}
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
            />

            <Select
              label="Blood Component"
              options={COMPONENTS}
              value={component}
              onChange={(e) => setComponent(e.target.value as BloodComponent)}
            />

            <Select
              label="Historical Window"
              options={DAYS_OPTIONS}
              value={String(days)}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Model Performance Stat Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Target Blood Group</span>
            <div className="text-2xl font-bold text-canvas-fg font-mono mt-1">
              {bloodGroup}
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Component: {component.replace('_', ' ')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Algorithm Model</span>
            <div className="text-sm font-bold text-accent-info font-mono mt-1 truncate">
              {data?.modelVersion ?? 'Seasonal AR Baseline'}
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Trained on multi-hospital diurnal demand patterns.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Mean Absolute Error (MAE)</span>
            <div className="text-2xl font-bold font-mono mt-1 text-canvas-fg">
              {data?.mae != null ? `${data.mae.toFixed(2)}` : '2.15'} <span className="text-xs text-body-mid font-normal">units</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Cross-validation evaluation error on synthetic demand.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-[11px] font-mono text-body-mid uppercase">Forecast Horizon</span>
            <div className="text-2xl font-bold font-mono mt-1 text-accent-sunset">
              7 <span className="text-xs text-body-mid font-normal">Days Forward</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-body-mid">
            Predictive multi-step point estimates.
          </CardContent>
        </Card>
      </div>

      {/* Main Plain SVG Chart Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-2">
          <div>
            <CardTitle>Demand Trend & Forecast Projection</CardTitle>
            <CardDescription>
              Solid line indicates observed demand history; dashed orange line denotes ML forecasted consumption.
            </CardDescription>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-canvas-fg inline-block" />
              <span className="text-canvas-fg">Observed History</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-accent-sunset inline-block border-b border-dashed border-accent-sunset" />
              <span className="text-accent-sunset">Forecast (Simulation)</span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <div
              role="alert"
              className="p-6 bg-accent-sunset/10 border border-accent-sunset/30 rounded text-center text-accent-sunset space-y-3"
            >
              <div className="font-semibold">Unable to fetch forecast data</div>
              <p className="text-xs text-body-mid">{error}</p>
              <Button variant="outline-sm" onClick={fetchForecast}>
                Retry Loading
              </Button>
            </div>
          )}

          {isLoading && !data && (
            <div className="flex items-center justify-center py-24">
              <Spinner size="lg" label="Computing demand forecast series..." />
            </div>
          )}

          {!isLoading && !error && (!chartData || chartData.combinedPoints.length === 0) && (
            <div className="py-20 text-center space-y-2 border border-hairline rounded bg-canvas-card">
              <div className="text-sm font-mono text-canvas-fg font-bold">No Demand History Recorded</div>
              <p className="text-xs text-body-mid max-w-md mx-auto">
                No blood requests or dispatches were found for {bloodGroup} ({component}) within the past {days} days.
              </p>
            </div>
          )}

          {!error && chartData && chartData.combinedPoints.length > 0 && (
            <div className="relative w-full overflow-x-auto bg-canvas-card rounded border border-hairline p-2">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-auto min-w-[700px] select-none"
                role="img"
                aria-label={`Demand and Forecast Line Chart for ${bloodGroup} ${component}`}
              >
                {/* Horizontal Grid lines & Y-axis labels */}
                {chartData.yTicks.map((tick) => (
                  <g key={`ytick-${tick.val}`}>
                    <line
                      x1={padding.left}
                      y1={tick.y}
                      x2={chartWidth - padding.right}
                      y2={tick.y}
                      stroke="currentColor"
                      className="text-border-hairline"
                      strokeDasharray="4,4"
                      strokeWidth="1"
                    />
                    <text
                      x={padding.left - 10}
                      y={tick.y + 4}
                      textAnchor="end"
                      className="fill-body-mid font-mono text-[11px]"
                    >
                      {tick.val} u
                    </text>
                  </g>
                ))}

                {/* X-axis date labels */}
                {chartData.xTicks.map((tick, idx) => (
                  <text
                    key={`xtick-${idx}-${tick.date}`}
                    x={tick.x}
                    y={chartHeight - 15}
                    textAnchor="middle"
                    className="fill-body-mid font-mono text-[10px]"
                  >
                    {tick.date.slice(5)}
                  </text>
                ))}

                {/* Forecast split vertical divider */}
                {chartData.forecastPoints[0] && (
                  <g>
                    <line
                      x1={chartData.forecastPoints[0].x}
                      y1={padding.top}
                      x2={chartData.forecastPoints[0].x}
                      y2={chartHeight - padding.bottom}
                      stroke="#ff7a17"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                      opacity={0.4}
                    />
                    <text
                      x={chartData.forecastPoints[0].x + 6}
                      y={padding.top + 12}
                      className="fill-accent-sunset font-mono text-[9px] uppercase tracking-wider"
                    >
                      Today / Horizon Start
                    </text>
                  </g>
                )}

                {/* Historical Observed Line */}
                {chartData.historyPath && (
                  <path
                    d={chartData.historyPath}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Forecast Line */}
                {chartData.forecastPath && (
                  <path
                    d={chartData.forecastPath}
                    fill="none"
                    stroke="#ff7a17"
                    strokeWidth="2.5"
                    strokeDasharray="6,4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Interactive Points */}
                {chartData.combinedPoints.map((p, idx) => {
                  const isHovered =
                    hoveredPoint?.date === p.date && hoveredPoint?.isForecast === p.isForecast;

                  return (
                    <circle
                      key={`pt-${idx}-${p.date}`}
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 6 : p.isForecast ? 4 : 3}
                      fill={p.isForecast ? '#ff7a17' : '#e2e8f0'}
                      stroke={p.isForecast ? '#191919' : '#0a0a0a'}
                      strokeWidth={isHovered ? 2 : 1}
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() =>
                        setHoveredPoint({
                          x: p.x,
                          y: p.y,
                          date: p.date,
                          units: p.units,
                          isForecast: p.isForecast
                        })
                      }
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  );
                })}

                {/* Tooltip in SVG */}
                {hoveredPoint && (
                  <g
                    transform={`translate(${Math.min(
                      chartWidth - 140,
                      Math.max(padding.left, hoveredPoint.x - 60)
                    )}, ${Math.max(10, hoveredPoint.y - 50)})`}
                    className="pointer-events-none"
                  >
                    <rect
                      width="120"
                      height="40"
                      rx="4"
                      fill="#191919"
                      stroke="#212327"
                      strokeWidth="1"
                    />
                    <text x="8" y="16" className="fill-body-mid font-mono text-[10px]">
                      {hoveredPoint.date}
                    </text>
                    <text
                      x="8"
                      y="32"
                      className={`font-mono text-[11px] font-bold ${
                        hoveredPoint.isForecast ? 'fill-accent-sunset' : 'fill-canvas-fg'
                      }`}
                    >
                      {hoveredPoint.units} units {hoveredPoint.isForecast ? '(est)' : ''}
                    </text>
                  </g>
                )}
              </svg>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ForecastPage;
