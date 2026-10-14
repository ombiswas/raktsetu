import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';

interface BenchmarkStrategy {
  strategy: string;
  type: string;
  ttfaMins: number;
  fulfillmentRate: string;
  nerRatio: number;
  giniIndex: number;
}

const BENCHMARK_DATA: BenchmarkStrategy[] = [
  {
    strategy: '1. Random Eligible (FIFO)',
    type: 'BASELINE',
    ttfaMins: 38.4,
    fulfillmentRate: '68.2%',
    nerRatio: 14.2,
    giniIndex: 0.18
  },
  {
    strategy: '2. Pure Nearest Neighbor (NN)',
    type: 'BASELINE',
    ttfaMins: 24.1,
    fulfillmentRate: '79.5%',
    nerRatio: 11.6,
    giniIndex: 0.49
  },
  {
    strategy: '3. Pure ML Probability',
    type: 'TREATMENT',
    ttfaMins: 16.8,
    fulfillmentRate: '87.1%',
    nerRatio: 8.4,
    giniIndex: 0.62
  },
  {
    strategy: '4. RaktSetu Multi-Objective Tiered',
    type: 'PROPOSED SYSTEM',
    ttfaMins: 14.2,
    fulfillmentRate: '93.4%',
    nerRatio: 4.8,
    giniIndex: 0.28
  }
];

const COLUMNS: Column<BenchmarkStrategy>[] = [
  {
    key: 'strategy',
    header: 'ALLOCATION STRATEGY',
    render: (r) => (
      <div>
        <span className="font-normal text-[#ffffff]">{r.strategy}</span>
        <div className="text-[10px] font-mono text-[#7d8187]">{r.type}</div>
      </div>
    )
  },
  {
    key: 'ttfaMins',
    header: 'TIME TO 1ST ACCEPT (TTFA)',
    render: (r) => <span className="font-mono text-sm">{r.ttfaMins} mins</span>
  },
  {
    key: 'fulfillmentRate',
    header: 'FULFILLMENT RATE (FR)',
    render: (r) => (
      <Badge variant={r.strategy.includes('RaktSetu') ? 'success' : 'neutral'}>
        {r.fulfillmentRate}
      </Badge>
    )
  },
  {
    key: 'nerRatio',
    header: 'NOTIF. EFFICIENCY (NER)',
    render: (r) => <span className="font-mono text-sm">{r.nerRatio} alerts/unit</span>
  },
  {
    key: 'giniIndex',
    header: 'GINI COEFFICIENT (BURNOUT)',
    render: (r) => (
      <span className={`font-mono text-sm ${r.giniIndex > 0.4 ? 'text-[#ffc285]' : 'text-[#dadbdf]'}`}>
        {r.giniIndex}
      </span>
    )
  }
];

export function ResearchPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div>
        <Eyebrow variant="sunset">RESEARCH EVALUATION & BENCHMARK SUITE</Eyebrow>
        <h1 className="text-2xl font-normal text-[#ffffff] tracking-tight">
          Algorithmic Simulation Benchmarks
        </h1>
        <p className="text-xs text-[#7d8187] mt-1">
          Synthetic cohort simulation (seed=42). Results reflect statistical modeling and algorithmic comparisons.
        </p>
      </div>

      {/* Summary Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <Eyebrow size="sm" variant="sunset" className="mb-1">
            ALERT REDUCTION (RQ2)
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffc285] my-1">-58.6% Alerts</div>
          <p className="text-xs text-[#7d8187]">Tiered Top-5 dispatch vs Nearest Neighbor broadcast</p>
        </Card>

        <Card>
          <Eyebrow size="sm" className="mb-1">
            LATENCY ADVANTAGE (RQ1)
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">-9.9 Mins TTFA</div>
          <p className="text-xs text-[#7d8187]">Faster first donor confirmation under night/work hours</p>
        </Card>

        <Card>
          <Eyebrow size="sm" className="mb-1">
            FAIRNESS INDEX (RQ3)
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">Gini = 0.28</div>
          <p className="text-xs text-[#7d8187]">Fatigue penalties prevent repetitive burnout on responsive donors</p>
        </Card>
      </div>

      {/* Benchmark Matrix */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow size="sm">EMPIRICAL COMPARISON</Eyebrow>
              <CardTitle>Strategy Benchmark Results</CardTitle>
            </div>
            <Badge variant="info">SIMULATION RUN</Badge>
          </div>
          <CardDescription>
            Evaluated on identical request sequences under controlled synthetic donor behavioral distributions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            data={BENCHMARK_DATA}
            keyExtractor={(s) => s.strategy}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default ResearchPage;
