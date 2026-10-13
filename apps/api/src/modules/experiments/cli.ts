#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { ExperimentConfigSchema, type DatasetMetadata } from './types.js';
import { SyntheticDataGenerator } from './generator.js';

function findWorkspaceRoot(startDir: string): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, 'experiments')) || fs.existsSync(path.join(curr, 'package.json'))) {
      if (fs.existsSync(path.join(curr, 'experiments', 'configs'))) {
        return curr;
      }
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir);
}

function parseCliArgs(): { configPath: string } {
  const args = process.argv.slice(2);
  let configPath = 'experiments/configs/default.json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg) {
        configPath = nextArg;
        i++;
      }
    } else if (arg?.startsWith('--config=')) {
      configPath = arg.slice('--config='.length);
    }
  }

  return { configPath };
}

export function runGeneratorCli(): void {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const { configPath } = parseCliArgs();

  const resolvedConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(workspaceRoot, configPath);

  if (!fs.existsSync(resolvedConfigPath)) {
    console.error(`[ERROR] Configuration file not found at: ${resolvedConfigPath}`);
    process.exit(1);
  }

  console.log(`[RaktSetu Simulation] Loading configuration: ${resolvedConfigPath}`);
  const rawContent = fs.readFileSync(resolvedConfigPath, 'utf-8');
  const configHash = crypto.createHash('sha256').update(rawContent).digest('hex');

  const parsedJson = JSON.parse(rawContent) as unknown;
  const config = ExperimentConfigSchema.parse(parsedJson);

  console.log(`[RaktSetu Simulation] Config SHA-256: ${configHash}`);
  console.log(`[RaktSetu Simulation] Seed: ${config.seed} | Timeline: ${config.timeline.days} days | Donors: ${config.population.num_donors}`);

  const generator = new SyntheticDataGenerator(config);
  const startTime = Date.now();
  const { notifications, demandSeries } = generator.simulate();
  const elapsedMs = Date.now() - startTime;

  console.log(`[RaktSetu Simulation] Generated ${notifications.length} notifications and ${demandSeries.length} demand records in ${elapsedMs}ms`);

  const resultsDir = path.resolve(workspaceRoot, 'experiments', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const generatedAt = new Date().toISOString();

  // 1. Write donor_response.csv
  const donorResponsePath = path.join(resultsDir, 'donor_response.csv');
  const donorMetadataPath = path.join(resultsDir, 'donor_response.metadata.json');

  const donorCsvHeader = [
    '# SIMULATION: Academic research synthetic dataset. Not clinical data.',
    [
      'notification_id',
      'request_id',
      'donor_id',
      'timestamp',
      'distance_km',
      'prior_response_rate',
      'recency_score',
      'total_past_donations',
      'days_since_last_donation',
      'recent_alerts_count',
      'age',
      'urgency',
      'hour_of_day',
      'is_weekend',
      'night_flag',
      'blood_group',
      'component_needed',
      'response',
      'simulation'
    ].join(',')
  ].join('\n');

  const donorCsvRows = notifications.map((r) =>
    [
      r.notification_id,
      r.request_id,
      r.donor_id,
      r.timestamp,
      r.distance_km,
      r.prior_response_rate,
      r.recency_score,
      r.total_past_donations,
      r.days_since_last_donation,
      r.recent_alerts_count,
      r.age,
      r.urgency,
      r.hour_of_day,
      r.is_weekend ? 'true' : 'false',
      r.night_flag,
      r.blood_group,
      r.component_needed,
      r.response,
      r.simulation
    ].join(',')
  );

  fs.writeFileSync(donorResponsePath, `${donorCsvHeader}\n${donorCsvRows.join('\n')}\n`, 'utf-8');

  const positiveResponses = notifications.filter((n) => n.response === 1).length;
  const positiveRate = notifications.length > 0 ? positiveResponses / notifications.length : 0;
  const meanDistance =
    notifications.length > 0
      ? notifications.reduce((acc, n) => acc + n.distance_km, 0) / notifications.length
      : 0;

  const donorMetadata: DatasetMetadata = {
    simulation: true,
    disclaimer: 'SIMULATION PROTOTYPE: Academic research synthetic dataset. Not clinical data.',
    seed: config.seed,
    config_hash: configHash,
    generator_version: config.version,
    generated_at: generatedAt,
    num_records: notifications.length,
    summary_metrics: {
      positive_responses: positiveResponses,
      positive_response_rate: Math.round(positiveRate * 10000) / 10000,
      mean_distance_km: Math.round(meanDistance * 100) / 100
    }
  };
  fs.writeFileSync(donorMetadataPath, JSON.stringify(donorMetadata, null, 2), 'utf-8');

  // 2. Write demand_series.csv
  const demandSeriesPath = path.join(resultsDir, 'demand_series.csv');
  const demandMetadataPath = path.join(resultsDir, 'demand_series.metadata.json');

  const demandCsvHeader = [
    '# SIMULATION: Academic research synthetic dataset. Not clinical data.',
    'date,blood_group,component,units,simulation'
  ].join('\n');

  const demandCsvRows = demandSeries.map((d) =>
    [d.date, d.blood_group, d.component, d.units, d.simulation].join(',')
  );

  fs.writeFileSync(demandSeriesPath, `${demandCsvHeader}\n${demandCsvRows.join('\n')}\n`, 'utf-8');

  const totalDemandUnits = demandSeries.reduce((acc, d) => acc + d.units, 0);

  const demandMetadata: DatasetMetadata = {
    simulation: true,
    disclaimer: 'SIMULATION PROTOTYPE: Academic research synthetic dataset. Not clinical data.',
    seed: config.seed,
    config_hash: configHash,
    generator_version: config.version,
    generated_at: generatedAt,
    num_records: demandSeries.length,
    summary_metrics: {
      total_units: totalDemandUnits,
      date_range_start: demandSeries[0]?.date ?? '',
      date_range_end: demandSeries[demandSeries.length - 1]?.date ?? ''
    }
  };
  fs.writeFileSync(demandMetadataPath, JSON.stringify(demandMetadata, null, 2), 'utf-8');

  console.log(`[RaktSetu Simulation] Successfully written:`);
  console.log(`  - ${donorResponsePath} (${notifications.length} rows, pos rate: ${(positiveRate * 100).toFixed(1)}%)`);
  console.log(`  - ${donorMetadataPath}`);
  console.log(`  - ${demandSeriesPath} (${demandSeries.length} daily group records, ${totalDemandUnits} total units)`);
  console.log(`  - ${demandMetadataPath}`);
}

// Run CLI directly if executed as main module
if (process.argv[1] && path.resolve(process.argv[1]).includes('cli')) {
  runGeneratorCli();
}
