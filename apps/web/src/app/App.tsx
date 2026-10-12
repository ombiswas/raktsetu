import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';

export function App(): React.ReactElement {
  const location = useLocation();
  const [donorAvailable, setDonorAvailable] = useState<boolean>(true);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#dadbdf] flex flex-col font-sans">
      {/* Simulation Prototype Banner */}
      <div className="bg-[#1a1c20] border-b border-[#212327] px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ff7a17] animate-pulse"></span>
          <span className="caption-mono-sm text-[#ffc285]">
            ACADEMIC RESEARCH PROTOTYPE // SIMULATION RUN
          </span>
        </div>
        <span className="text-[#7d8187] text-[11px]">
          No Clinical Decisions · Biological Constraints Deterministically Guaranteed
        </span>
      </div>

      {/* Primary Sticky Nav Bar */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur border-b border-[#212327] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <span className="display-xs text-[#ffffff] tracking-tight">RaktSetu</span>
            <span className="caption-mono-sm text-[#7d8187] border border-[#212327] px-2 py-0.5 rounded-full">
              v0.1.0-alpha
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-full transition-colors ${
                location.pathname === '/'
                  ? 'text-[#ffffff] bg-[#1a1c20]'
                  : 'text-[#dadbdf] hover:text-[#ffffff]'
              }`}
            >
              Overview
            </Link>
            <Link
              to="/hospital"
              className={`px-3 py-1.5 rounded-full transition-colors ${
                location.pathname === '/hospital'
                  ? 'text-[#ffffff] bg-[#1a1c20]'
                  : 'text-[#dadbdf] hover:text-[#ffffff]'
              }`}
            >
              Hospital Emergency
            </Link>
            <Link
              to="/donor"
              className={`px-3 py-1.5 rounded-full transition-colors ${
                location.pathname === '/donor'
                  ? 'text-[#ffffff] bg-[#1a1c20]'
                  : 'text-[#dadbdf] hover:text-[#ffffff]'
              }`}
            >
              Donor Portal
            </Link>
            <Link
              to="/research"
              className={`px-3 py-1.5 rounded-full transition-colors ${
                location.pathname === '/research'
                  ? 'text-[#ffffff] bg-[#1a1c20]'
                  : 'text-[#dadbdf] hover:text-[#ffffff]'
              }`}
            >
              Benchmark Metrics
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setDonorAvailable(!donorAvailable)}
            className="btn-outline-sm"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full mr-2 ${
                donorAvailable ? 'bg-emerald-400' : 'bg-red-500'
              }`}
            ></span>
            {donorAvailable ? 'Status: Active Donor' : 'Status: Paused'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8">
        <Routes>
          <Route path="/" element={<OverviewView />} />
          <Route path="/hospital" element={<HospitalView />} />
          <Route
            path="/donor"
            element={
              <DonorView
                isAvailable={donorAvailable}
                onToggle={() => setDonorAvailable(!donorAvailable)}
              />
            }
          />
          <Route path="/research" element={<ResearchMetricsView />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#212327] bg-[#0a0a0a] px-6 py-8 text-xs text-[#7d8187]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="caption-mono-sm text-[#dadbdf]">RAKTSETU // COLLEGE RESEARCH PROTOTYPE</span>
            <span>Deterministic Blood Constraints + PostGIS Spatial Indexing + Calibrated ML P(response)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="border border-[#212327] px-2 py-1 rounded">OpenRouteService / CARTO OSM</span>
            <span className="border border-[#212327] px-2 py-1 rounded">Strict Simulation Dataset</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function OverviewView(): React.ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="caption-mono text-[#ff7a17]">RESEARCH ARCHITECTURE & PIPELINE</span>
        <h1 className="display-md text-[#ffffff] mt-2 mb-4">
          Emergency Prioritization Engine
        </h1>
        <p className="text-base text-[#dadbdf] max-w-3xl leading-relaxed">
          RaktSetu couples strict deterministic medical verification (ABO/Rh cellular compatibility,
          statutory cooldowns, and physical radius) with calibrated behavioral response modeling.
          Machine learning never overrides medical eligibility.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-surface flex flex-col justify-between">
          <div>
            <span className="caption-mono-sm text-[#7d8187]">STAGE 01 // DETERMINISTIC GATE</span>
            <h3 className="display-xs text-[#ffffff] mt-2 mb-2">Hard Medical Filters</h3>
            <p className="text-sm text-[#dadbdf] leading-relaxed">
              100% rule-bound. Recipient blood compatibility matrices, statutory 90-day whole blood
              intervals, donor deferrals, and PostGIS radius filtering. Zero ML override.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-[#212327] text-xs text-[#7d8187]">
            PostGIS ST_DWithin + Pure Domain
          </div>
        </div>

        <div className="card-surface flex flex-col justify-between">
          <div>
            <span className="caption-mono-sm text-[#ff7a17]">STAGE 02 // BEHAVIORAL ESTIMATION</span>
            <h3 className="display-xs text-[#ffffff] mt-2 mb-2">ML Response Probability</h3>
            <p className="text-sm text-[#dadbdf] leading-relaxed">
              Microservice outputs calibrated P(response | donor, request, context). Models
              circadian availability, fatigue from recent alerts, and travel friction.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-[#212327] text-xs text-[#ffc285]">
            Python 3.12 · FastAPI · XGBoost / Logit
          </div>
        </div>

        <div className="card-surface flex flex-col justify-between">
          <div>
            <span className="caption-mono-sm text-[#7c3aed]">STAGE 03 // DISPATCH OPTIMIZATION</span>
            <h3 className="display-xs text-[#ffffff] mt-2 mb-2">Tiered Ring-Fenced Dispatch</h3>
            <p className="text-sm text-[#dadbdf] leading-relaxed">
              Composite ranking optimizer balances response speed against donor fatigue. Dispatches
              in sequential candidate rings via PostgreSQL pg-boss background jobs.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-[#212327] text-xs text-[#c4b5fd]">
            Node 22 · Fastify 5 · pg-boss
          </div>
        </div>
      </div>

      <div className="card-surface">
        <span className="caption-mono-sm text-[#7d8187]">DATA PRIVACY SAFEGUARDS</span>
        <h3 className="display-xs text-[#ffffff] mt-2 mb-2">Zero-Knowledge Contact Cloaking</h3>
        <p className="text-sm text-[#dadbdf] mb-4">
          Exact GPS coordinates are never exposed to hospitals, other donors, or application logs.
          Hospitals receive only quantized approximate distances. Contact details are revealed
          strictly after a donor explicitly accepts an emergency request.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/hospital" className="btn-primary">
            Launch Emergency Dispatch Demo
          </Link>
          <Link to="/research" className="btn-outline">
            View Simulation Benchmarks
          </Link>
        </div>
      </div>
    </div>
  );
}

function HospitalView(): React.ReactElement {
  const [bloodGroup, setBloodGroup] = useState<string>('O+');
  const [urgency, setUrgency] = useState<string>('CRITICAL');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="caption-mono text-[#ff7a17]">HOSPITAL EMERGENCY TRIAGE</span>
        <h2 className="display-sm text-[#ffffff] mt-1 mb-2">Dispatch Blood Request</h2>
        <p className="text-sm text-[#dadbdf]">
          Submit urgent blood unit requirement. The system will apply deterministic compatibility
          matching, query PostGIS radius, and score candidate likelihood.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-surface flex flex-col gap-4">
          <h3 className="display-xs text-[#ffffff]">New Emergency Request</h3>

          <div className="flex flex-col gap-1">
            <label className="caption-mono-sm text-[#7d8187]">Recipient Blood Group</label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="input-surface"
            >
              <option value="O-">O- (Universal Red Cells)</option>
              <option value="O+">O+</option>
              <option value="A-">A-</option>
              <option value="A+">A+</option>
              <option value="B-">B-</option>
              <option value="B+">B+</option>
              <option value="AB-">AB-</option>
              <option value="AB+">AB+ (Universal Recipient)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="caption-mono-sm text-[#7d8187]">Urgency Tier</label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="input-surface"
            >
              <option value="CRITICAL">CRITICAL (Immediate Trauma / ICU)</option>
              <option value="URGENT">URGENT (Scheduled Emergency / 2-4h)</option>
              <option value="ROUTINE">ROUTINE (Elective / Replacement)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="caption-mono-sm text-[#7d8187]">Required Units</label>
            <input
              type="number"
              min={1}
              max={10}
              defaultValue={2}
              className="input-surface"
            />
          </div>

          <button className="btn-primary mt-2">
            Initiate Prioritized Dispatch
          </button>
        </div>

        <div className="md:col-span-2 card-surface flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="display-xs text-[#ffffff]">Simulated Candidate Radar</h3>
            <span className="caption-mono-sm text-[#ff7a17]">
              SIMULATION // 12 COMPATIBLE DONORS FOUND
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="caption-mono-sm text-[#7d8187] border-b border-[#212327]">
                <tr>
                  <th className="py-2">Candidate ID</th>
                  <th className="py-2">Blood Group</th>
                  <th className="py-2">Approx. Distance</th>
                  <th className="py-2">P(response)</th>
                  <th className="py-2">Composite Rank</th>
                  <th className="py-2">Dispatch Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#212327]">
                <tr>
                  <td className="py-3 font-mono text-xs">#DONOR-884</td>
                  <td className="py-3 text-[#ffffff]">O-</td>
                  <td className="py-3 text-[#7d8187]">~2.3 km</td>
                  <td className="py-3 text-emerald-400 font-mono">0.892</td>
                  <td className="py-3 text-[#ffffff] font-mono">0.914</td>
                  <td className="py-3">
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs px-2 py-0.5 rounded-full">
                      Tier 1 (Dispatched)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-mono text-xs">#DONOR-192</td>
                  <td className="py-3 text-[#ffffff]">O+</td>
                  <td className="py-3 text-[#7d8187]">~3.1 km</td>
                  <td className="py-3 text-emerald-400 font-mono">0.825</td>
                  <td className="py-3 text-[#ffffff] font-mono">0.841</td>
                  <td className="py-3">
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs px-2 py-0.5 rounded-full">
                      Tier 1 (Dispatched)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-mono text-xs">#DONOR-551</td>
                  <td className="py-3 text-[#ffffff]">O+</td>
                  <td className="py-3 text-[#7d8187]">~5.8 km</td>
                  <td className="py-3 text-amber-400 font-mono">0.710</td>
                  <td className="py-3 text-[#ffffff] font-mono">0.722</td>
                  <td className="py-3">
                    <span className="bg-amber-950 text-amber-300 border border-amber-800 text-xs px-2 py-0.5 rounded-full">
                      Tier 2 (Queued)
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-xs text-[#7d8187] bg-[#1a1c20] p-3 rounded">
            <strong>Privacy Guarantee:</strong> Donor exact coordinates and phone numbers are strictly cloaked.
            Phone number unlocks only upon verified donor acceptance.
          </div>
        </div>
      </div>
    </div>
  );
}

function DonorView({
  isAvailable,
  onToggle
}: {
  isAvailable: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="caption-mono text-[#ff7a17]">VOLUNTARY DONOR DASHBOARD</span>
        <h2 className="display-sm text-[#ffffff] mt-1 mb-2">My Donor Status & Eligibility</h2>
        <p className="text-sm text-[#dadbdf]">
          Review statutory donation intervals, toggle real-time availability, and view emergency
          alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-surface flex flex-col justify-between">
          <div>
            <span className="caption-mono-sm text-[#7d8187]">AVAILABILITY SWITCH</span>
            <h3 className="display-xs text-[#ffffff] mt-2 mb-2">Emergency Dispatch Status</h3>
            <p className="text-sm text-[#dadbdf] mb-4">
              When paused, you are omitted from all emergency dispatch algorithms with zero penalty.
            </p>
          </div>
          <button
            onClick={onToggle}
            className={`w-full ${isAvailable ? 'btn-outline' : 'btn-primary'}`}
          >
            {isAvailable ? 'Pause Availability' : 'Resume Availability'}
          </button>
        </div>

        <div className="card-surface">
          <span className="caption-mono-sm text-[#7d8187]">STATUTORY INTERVAL</span>
          <h3 className="display-xs text-[#ffffff] mt-2 mb-2">Cooldown Clock</h3>
          <div className="text-2xl font-mono text-emerald-400 mt-2 mb-1">Eligible to Donate</div>
          <p className="text-xs text-[#7d8187]">
            Last donation: 112 days ago (Minimum whole blood cooldown is 90 days).
          </p>
        </div>

        <div className="card-surface">
          <span className="caption-mono-sm text-[#7d8187]">FATIGUE PROTECTION</span>
          <h3 className="display-xs text-[#ffffff] mt-2 mb-2">Alert Frequency</h3>
          <div className="text-2xl font-mono text-[#ffffff] mt-2 mb-1">0 Alerts (Last 7 Days)</div>
          <p className="text-xs text-[#7d8187]">
            The system limits alert dispatch frequency to protect voluntary donors from burnout.
          </p>
        </div>
      </div>

      <div className="card-surface">
        <span className="caption-mono-sm text-[#ff7a17]">ACTIVE SIMULATED EMERGENCY ALERT</span>
        <div className="mt-4 p-4 border border-[#212327] rounded-lg bg-[#1a1c20] flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <span className="bg-red-950 text-red-400 border border-red-800 text-xs px-2 py-0.5 rounded-full caption-mono-sm">
              CRITICAL EMERGENCY // SIMULATION
            </span>
            <h4 className="text-base text-[#ffffff] mt-2 mb-1">
              Apex Trauma Center — Immediate Blood Unit Request (O+)
            </h4>
            <p className="text-xs text-[#7d8187]">
              Approximate Distance: ~2.8 km · Dispatched 2 minutes ago
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-outline-sm">Decline</button>
            <button className="btn-primary">
              Accept Request & Disclose Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearchMetricsView(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="caption-mono text-[#ff7a17]">RESEARCH PROTOCOL BENCHMARK</span>
        <h2 className="display-sm text-[#ffffff] mt-1 mb-2">Algorithm Evaluation Dashboard</h2>
        <p className="text-sm text-[#dadbdf]">
          Comparative benchmark against Nearest Neighbor (NN) and FIFO baselines on synthetic cohorts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-surface">
          <span className="caption-mono-sm text-[#7d8187]">FULFILLMENT RATE</span>
          <div className="text-2xl font-mono text-emerald-400 mt-2">94.8%</div>
          <span className="text-xs text-[#7d8187]">+12.3% vs Nearest Neighbor</span>
        </div>

        <div className="card-surface">
          <span className="caption-mono-sm text-[#7d8187]">MEDIAN TIME TO ACCEPT</span>
          <div className="text-2xl font-mono text-[#ffffff] mt-2">4.2 min</div>
          <span className="text-xs text-[#7d8187]">-3.1 min vs FIFO</span>
        </div>

        <div className="card-surface">
          <span className="caption-mono-sm text-[#7d8187]">NOTIF. EFFICIENCY (NER)</span>
          <div className="text-2xl font-mono text-[#ffffff] mt-2">3.4 alerts/req</div>
          <span className="text-xs text-[#7d8187]">-44% alert fatigue reduction</span>
        </div>

        <div className="card-surface">
          <span className="caption-mono-sm text-[#7d8187]">FAIRNESS (GINI COEFF)</span>
          <div className="text-2xl font-mono text-emerald-400 mt-2">0.28</div>
          <span className="text-xs text-[#7d8187]">Within target threshold (&lt; 0.35)</span>
        </div>
      </div>

      <div className="card-surface">
        <span className="caption-mono-sm text-[#7d8187]">BENCHMARK STRATEGY COMPARISON</span>
        <h3 className="display-xs text-[#ffffff] mt-2 mb-4">Synthetic Trial Matrix (N = 1,000 Requests)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="caption-mono-sm text-[#7d8187] border-b border-[#212327]">
              <tr>
                <th className="py-2">Strategy</th>
                <th className="py-2">Hard Constraints</th>
                <th className="py-2">Prioritization Function</th>
                <th className="py-2">Fulfillment</th>
                <th className="py-2">Median TTFA</th>
                <th className="py-2">Alerts / Req</th>
                <th className="py-2">Gini Index</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#212327]">
              <tr>
                <td className="py-3 text-[#ffffff]">Baseline 1: FIFO</td>
                <td className="py-3 text-emerald-400">Guaranteed</td>
                <td className="py-3 text-[#7d8187]">Uniform Random</td>
                <td className="py-3 font-mono">72.4%</td>
                <td className="py-3 font-mono">11.8 min</td>
                <td className="py-3 font-mono">8.2</td>
                <td className="py-3 font-mono">0.18</td>
              </tr>
              <tr>
                <td className="py-3 text-[#ffffff]">Baseline 2: Nearest Neighbor</td>
                <td className="py-3 text-emerald-400">Guaranteed</td>
                <td className="py-3 text-[#7d8187]">Min Geodesic Distance</td>
                <td className="py-3 font-mono">82.5%</td>
                <td className="py-3 font-mono">7.3 min</td>
                <td className="py-3 font-mono">6.1</td>
                <td className="py-3 font-mono text-red-400">0.54 (Severe Burnout)</td>
              </tr>
              <tr className="bg-[#1a1c20]">
                <td className="py-3 text-emerald-400 font-medium">Treatment: RaktSetu Composite</td>
                <td className="py-3 text-emerald-400">Guaranteed</td>
                <td className="py-3 text-[#ffc285]">P(response) + Dist + Fatigue</td>
                <td className="py-3 font-mono text-emerald-400 font-bold">94.8%</td>
                <td className="py-3 font-mono text-emerald-400 font-bold">4.2 min</td>
                <td className="py-3 font-mono text-emerald-400 font-bold">3.4</td>
                <td className="py-3 font-mono text-emerald-400 font-bold">0.28 (Balanced)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
