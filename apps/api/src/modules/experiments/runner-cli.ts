#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { ExperimentConfigSchema } from './types.js';
import { SimulationRunner } from './simulation-runner.js';
import type { StrategyName, SimulationOutputBundle } from './types.js';

function findWorkspaceRoot(startDir: string): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (
      (fs.existsSync(path.join(curr, 'experiments')) || fs.existsSync(path.join(curr, 'package.json'))) &&
      fs.existsSync(path.join(curr, 'experiments', 'configs'))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir);
}

interface CliArgs {
  configPath: string;
  numSeeds: number;
  isQuick: boolean;
  skipSweeps: boolean;
  outputDir?: string | undefined;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  let configPath = 'experiments/configs/default.json';
  let numSeeds = 30;
  let isQuick = false;
  let skipSweeps = false;
  let outputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--config' && i + 1 < args.length) {
      configPath = args[++i]!;
    } else if (arg.startsWith('--config=')) {
      configPath = arg.slice('--config='.length);
    } else if (arg === '--seeds' && i + 1 < args.length) {
      numSeeds = parseInt(args[++i]!, 10);
    } else if (arg.startsWith('--seeds=')) {
      numSeeds = parseInt(arg.slice('--seeds='.length), 10);
    } else if (arg === '--quick') {
      isQuick = true;
      numSeeds = 5;
    } else if (arg === '--skip-sweeps') {
      skipSweeps = true;
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      outputDir = args[++i]!;
    } else if (arg.startsWith('--output-dir=')) {
      outputDir = arg.slice('--output-dir='.length);
    }
  }

  return { configPath, numSeeds, isQuick, skipSweeps, outputDir };
}

export function runSimulationCli(): void {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const { configPath, numSeeds, isQuick, skipSweeps, outputDir } = parseCliArgs();

  const resolvedConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(workspaceRoot, configPath);

  if (!fs.existsSync(resolvedConfigPath)) {
    console.error(`[ERROR] Configuration file not found at: ${resolvedConfigPath}`);
    process.exit(1);
  }

  console.log('='.repeat(78));
  console.log('  RaktSetu Multi-Strategy Benchmark Runner (Phase 14)');
  console.log('  SIMULATION RESULTS: Academic Research Prototype - Not Clinical Data');
  console.log('='.repeat(78));
  console.log(`[Config] Loading: ${resolvedConfigPath}`);

  const rawConfig = fs.readFileSync(resolvedConfigPath, 'utf-8');
  const configHash = crypto.createHash('sha256').update(rawConfig).digest('hex');
  const parsedJson = JSON.parse(rawConfig) as unknown;
  const config = ExperimentConfigSchema.parse(parsedJson);

  console.log(`[Config SHA-256] ${configHash}`);
  console.log(`[Parameters] Base Seed: ${config.seed} | Seeds: ${numSeeds} | Quick: ${isQuick}`);

  const runner = new SimulationRunner();
  const seeds = Array.from({ length: numSeeds }, (_, i) => config.seed + i);

  const runnerOptions = isQuick
    ? { maxRequests: 25, batchSize: 5 }
    : { batchSize: 5 };

  console.log(`\n[Execution] Running ${seeds.length} seeded simulation trajectories...`);
  const startTime = Date.now();
  const { metrics, summaries, pairedComparisons } = runner.runMultiSeed(config, seeds, runnerOptions);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Execution] Completed ${metrics.length} strategy evaluations across ${seeds.length} seeds in ${elapsedSec}s`);

  // Sensitivity Sweeps
  let sensitivityResults: ReturnType<typeof runner.runSensitivitySweeps> | undefined = undefined;
  if (!skipSweeps) {
    console.log('\n[Sensitivity] Running sweeps over population, base rate, noise, and urgency...');
    const sweepSeeds = seeds.slice(0, Math.min(5, seeds.length));
    sensitivityResults = runner.runSensitivitySweeps(config, sweepSeeds, {
      maxRequests: isQuick ? 15 : 30
    });
    console.log(`[Sensitivity] Generated ${sensitivityResults.length} parameter sweep points.`);
  }

  // Persistence
  const resolvedResultsDir = outputDir
    ? path.resolve(workspaceRoot, outputDir)
    : path.resolve(workspaceRoot, 'experiments', 'results');

  const runsDir = path.resolve(workspaceRoot, 'experiments', 'experiment_runs');

  if (!fs.existsSync(resolvedResultsDir)) {
    fs.mkdirSync(resolvedResultsDir, { recursive: true });
  }
  if (!fs.existsSync(runsDir)) {
    fs.mkdirSync(runsDir, { recursive: true });
  }

  // 1. Write strategy_metrics.csv
  const metricsCsvPath = path.join(resolvedResultsDir, 'strategy_metrics.csv');
  const csvHeaders = [
    '# Simulation results: Multi-strategy benchmark raw observations. Not clinical data.',
    [
      'strategy',
      'request_id',
      'seed',
      'urgency',
      'units_required',
      'units_fulfilled',
      'fulfilled',
      'donors_contacted',
      'top_k_response_rate',
      'time_to_first_accept_sec',
      'time_to_fulfillment_sec',
      'mean_donor_distance_km',
      'median_donor_distance_km',
      'accepted_mean_distance_km',
      'radius_expansions',
      'batches_dispatched'
    ].join(',')
  ];

  const csvRows = metrics.map((m) =>
    [
      m.strategy,
      m.requestId,
      m.seed,
      m.urgency,
      m.unitsRequired,
      m.unitsFulfilled,
      m.fulfilled ? 1 : 0,
      m.donorsContacted,
      m.topKResponseRate,
      m.timeToFirstAcceptSec ?? '',
      m.timeToFulfillmentSec ?? '',
      m.meanDonorDistanceKm,
      m.medianDonorDistanceKm,
      m.acceptedMeanDistanceKm ?? '',
      m.radiusExpansions,
      m.batchesDispatched
    ].join(',')
  );

  fs.writeFileSync(metricsCsvPath, [...csvHeaders, ...csvRows].join('\n'), 'utf-8');
  console.log(`\n[Artifact] Raw metrics written to: ${metricsCsvPath}`);

  // 2. Write paired_differences.csv
  const pairedCsvPath = path.join(resolvedResultsDir, 'paired_differences.csv');
  const pairedCsvRows = [
    '# Simulation results: Paired difference analysis (Hybrid Full vs Baseline Proximity).',
    'metric,baseline_mean,hybrid_mean,mean_difference,ci95_lower,ci95_upper,interpretation',
    ...pairedComparisons.map((p) =>
      `"${p.metric}",${p.baselineMean},${p.hybridMean},${p.meanDifference},${p.ci95Lower},${p.ci95Upper},"${p.interpretation.replace(/"/g, '""')}"`
    )
  ];
  fs.writeFileSync(pairedCsvPath, pairedCsvRows.join('\n'), 'utf-8');
  console.log(`[Artifact] Paired comparisons written to: ${pairedCsvPath}`);

  // 3. Write sensitivity_sweep.csv
  if (sensitivityResults) {
    const sweepCsvPath = path.join(resolvedResultsDir, 'sensitivity_sweep.csv');
    const sweepCsvRows = [
      '# Simulation results: Sensitivity analysis parameter sweep.',
      'parameter,value_label,strategy,fulfillment_rate,mean_ttfa_sec,mean_tff_sec,mean_donors_contacted,mean_donor_distance_km,top_k_response_rate',
      ...sensitivityResults.map((s) =>
        `${s.parameter},"${s.valueLabel}",${s.strategy},${s.fulfillmentRate},${s.meanTimeToFirstAcceptSec},${s.meanTimeToFulfillmentSec},${s.meanDonorsContacted},${s.meanDonorDistanceKm},${s.topKResponseRate}`
      )
    ];
    fs.writeFileSync(sweepCsvPath, sweepCsvRows.join('\n'), 'utf-8');
    console.log(`[Artifact] Sensitivity sweep written to: ${sweepCsvPath}`);
  }

  // 4. Write simulation_summary.json
  const summaryJsonPath = path.join(resolvedResultsDir, 'simulation_summary.json');
  const outputBundle: SimulationOutputBundle = {
    simulation: true,
    disclaimer: 'SIMULATION PROTOTYPE: Academic benchmark results. Not clinical data.',
    seed: config.seed,
    numSeeds: seeds.length,
    configHash,
    executedAt: new Date().toISOString(),
    requestCount: metrics.length / 4,
    strategySummaries: summaries,
    pairedComparisons,
    sensitivityResults
  };
  fs.writeFileSync(summaryJsonPath, JSON.stringify(outputBundle, null, 2), 'utf-8');
  console.log(`[Artifact] Simulation summary bundle written to: ${summaryJsonPath}`);

  // 5. Persist to experiments/experiment_runs with seed and config hash
  const runFile = path.join(
    runsDir,
    `run_seed${config.seed}_hash${configHash.slice(0, 10)}.json`
  );
  fs.writeFileSync(runFile, JSON.stringify(outputBundle, null, 2), 'utf-8');
  console.log(`[Artifact] Experiment run persisted to: ${runFile}`);

  // Display Formatted Summary Tables
  console.log('\n' + '='.repeat(108));
  console.log('  Simulation results: Multi-Strategy Benchmark Summary (Mean ± Std Dev [95% Bootstrap CI])');
  console.log('='.repeat(108));
  console.log(
    'Strategy'.padEnd(22) + ' | ' +
    'Fulfillment'.padEnd(16) + ' | ' +
    'Top-K Resp %'.padEnd(16) + ' | ' +
    'Contacted'.padEnd(14) + ' | ' +
    'TTFA (sec)'.padEnd(16) + ' | ' +
    'Distance (km)'.padEnd(16)
  );
  console.log('-'.repeat(108));

  const strats: StrategyName[] = [
    'baseline_proximity',
    'hybrid_full',
    'ablation_ml_only',
    'ablation_geo_only'
  ];

  for (const s of strats) {
    const summary = summaries[s];
    const fr = `${(summary.fulfillmentRate.mean * 100).toFixed(1)}% [${(summary.fulfillmentRate.ci95Lower * 100).toFixed(1)}-${(summary.fulfillmentRate.ci95Upper * 100).toFixed(1)}]`;
    const resp = `${(summary.topKResponseRate.mean * 100).toFixed(1)}% [${(summary.topKResponseRate.ci95Lower * 100).toFixed(1)}-${(summary.topKResponseRate.ci95Upper * 100).toFixed(1)}]`;
    const cont = `${summary.donorsContacted.mean.toFixed(1)} ± ${summary.donorsContacted.stdDev.toFixed(1)}`;
    const ttfa = `${summary.timeToFirstAcceptSec.mean.toFixed(1)}s [${summary.timeToFirstAcceptSec.ci95Lower.toFixed(0)}-${summary.timeToFirstAcceptSec.ci95Upper.toFixed(0)}]`;
    const dist = `${summary.meanDonorDistanceKm.mean.toFixed(2)} km [${summary.meanDonorDistanceKm.ci95Lower.toFixed(2)}-${summary.meanDonorDistanceKm.ci95Upper.toFixed(2)}]`;

    console.log(
      s.padEnd(22) + ' | ' +
      fr.padEnd(16) + ' | ' +
      resp.padEnd(16) + ' | ' +
      cont.padEnd(14) + ' | ' +
      ttfa.padEnd(16) + ' | ' +
      dist.padEnd(16)
    );
  }
  console.log('='.repeat(108));

  console.log('\n' + '='.repeat(108));
  console.log('  Simulation results: Paired Comparison (Hybrid Full vs Baseline Proximity)');
  console.log('='.repeat(108));
  console.log(
    'Metric'.padEnd(35) + ' | ' +
    'Baseline'.padEnd(10) + ' | ' +
    'Hybrid'.padEnd(10) + ' | ' +
    'Diff'.padEnd(10) + ' | ' +
    '95% CI'.padEnd(16) + ' | ' +
    'Interpretation'
  );
  console.log('-'.repeat(108));
  for (const p of pairedComparisons) {
    const diffStr = (p.meanDifference > 0 ? '+' : '') + p.meanDifference.toFixed(2);
    const ciStr = `[${p.ci95Lower.toFixed(2)}, ${p.ci95Upper.toFixed(2)}]`;
    console.log(
      p.metric.padEnd(35) + ' | ' +
      p.baselineMean.toFixed(2).padEnd(10) + ' | ' +
      p.hybridMean.toFixed(2).padEnd(10) + ' | ' +
      diffStr.padEnd(10) + ' | ' +
      ciStr.padEnd(16) + ' | ' +
      p.interpretation
    );
  }
  console.log('='.repeat(108) + '\n');
}

// Execute CLI directly when invoked as a script
runSimulationCli();
