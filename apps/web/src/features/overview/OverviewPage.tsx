import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';

interface PipelineStage {
  step: string;
  name: string;
  guarantee: string;
  status: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    step: 'STAGE 1',
    name: 'Deterministic Biological Filter',
    guarantee: '100% Rule Enforced (ABO/Rh matrix, 90-day whole blood interval, age 18-65, weight >= 45kg)',
    status: 'ACTIVE'
  },
  {
    step: 'STAGE 2',
    name: 'Spatial PostGIS Boundary',
    guarantee: 'ST_DWithin bounding radius, coordinate cloaking (exact lat/lon never exposed)',
    status: 'ACTIVE'
  },
  {
    step: 'STAGE 3',
    name: 'ML Response Calibration',
    guarantee: 'XGBoost P(response|donor,request,context) in Node API hybrid ranker; fallback on timeout',
    status: 'ACTIVE'
  },
  {
    step: 'STAGE 4',
    name: 'Tiered Top-K Ring-Fenced Dispatch',
    guarantee: 'Top-5 donor alerts per batch, consent-based contact reveal post-acceptance',
    status: 'ACTIVE'
  }
];

const STAGE_COLUMNS: Column<PipelineStage>[] = [
  { key: 'step', header: 'STAGE', render: (r) => <span className="font-mono text-xs">{r.step}</span> },
  { key: 'name', header: 'SYSTEM SUBSYSTEM' },
  { key: 'guarantee', header: 'RESEARCH INVARIANT & CLINICAL BOUNDARY' },
  {
    key: 'status',
    header: 'STATUS',
    align: 'right',
    render: (r) => (
      <Badge variant="info" dot>
        {r.status}
      </Badge>
    )
  }
];

export function OverviewPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero Section */}
      <section className="flex flex-col gap-3">
        <Eyebrow variant="sunset">ACADEMIC RESEARCH PROTOTYPE // SIMULATION RUN</Eyebrow>
        <h1 className="text-3xl sm:text-4xl font-normal text-[#ffffff] tracking-tight">
          AI-Assisted Emergency Blood-Donor Prioritization
        </h1>
        <p className="text-base text-[#7d8187] max-w-2xl leading-relaxed">
          RaktSetu couples strict deterministic biological compatibility and statutory donation
          intervals with machine learning prioritization and spatial privacy to prevent donor fatigue
          and reduce time-to-first-acceptance.
        </p>
      </section>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <Eyebrow size="sm" className="mb-1">
            HARD BOUNDARY
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">100% Deterministic</div>
          <p className="text-xs text-[#7d8187]">Zero ML override on ABO/Rh or 90-day cooldown</p>
        </Card>

        <Card>
          <Eyebrow size="sm" className="mb-1">
            PRIVACY GUARANTEE
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">Zero Lat/Lon Leak</div>
          <p className="text-xs text-[#7d8187]">Quantized distances; contact cloaked until consent</p>
        </Card>

        <Card>
          <Eyebrow size="sm" className="mb-1">
            DECISION ENGINE
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffffff] my-1">Hybrid Ranker</div>
          <p className="text-xs text-[#7d8187]">Calibrated P(response) + spatial + fatigue decay</p>
        </Card>

        <Card>
          <Eyebrow size="sm" variant="sunset" className="mb-1">
            QUEUE DISPATCH
          </Eyebrow>
          <div className="text-2xl font-normal text-[#ffc285] my-1">Tiered Top-K</div>
          <p className="text-xs text-[#7d8187]">Prevents donor alert fatigue and broadcast spam</p>
        </Card>
      </div>

      {/* Invariant Table */}
      <Card>
        <CardHeader>
          <Eyebrow size="sm">RESEARCH VERIFICATION MATRIX</Eyebrow>
          <CardTitle>Core System Pipeline</CardTitle>
          <CardDescription>
            Deterministic constraints run prior to ML inference. The ML service only outputs calibrated
            response probabilities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={STAGE_COLUMNS}
            data={PIPELINE_STAGES}
            keyExtractor={(s) => s.step}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default OverviewPage;
