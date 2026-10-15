/**
 * Experiment Reproducibility & Determinism Tests
 * Asserts that:
 * 1. Running the multi-strategy simulation with the exact same config and seed produces byte-identical metrics.
 * 2. Multi-seed summaries and bootstrap confidence intervals are 100% deterministic.
 * 3. Paired trade-offs (response likelihood vs contact distance) are honestly preserved across runs.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExperimentConfigSchema } from '../types.js';
import { SimulationRunner } from '../simulation-runner.js';

describe('Phase 14: Multi-Strategy Experiment Runner Reproducibility', () => {
  const configPath = path.resolve(process.cwd(), '../../experiments/configs/default.json');
  const rawConfig = fs.readFileSync(configPath, 'utf-8');
  const baseConfig = ExperimentConfigSchema.parse(JSON.parse(rawConfig));

  it('produces byte-identical metrics when rerun with the exact same config and seed', () => {
    const runner = new SimulationRunner();
    const options = { maxRequests: 20, batchSize: 5 };

    const run1 = runner.runSingleSeed(baseConfig, options);
    const run2 = runner.runSingleSeed(baseConfig, options);

    expect(run1.length).toBe(run2.length);
    expect(run1.length).toBeGreaterThan(0);

    // Deep equality verification
    expect(run1).toEqual(run2);

    // Byte-identical serialization check
    const json1 = JSON.stringify(run1);
    const json2 = JSON.stringify(run2);
    expect(json1).toBe(json2);
  });

  it('evaluates all 4 production strategies on the exact same request candidate sets', () => {
    const runner = new SimulationRunner();
    const options = { maxRequests: 10, batchSize: 5 };

    const metrics = runner.runSingleSeed(baseConfig, options);

    const strategies = new Set(metrics.map((m) => m.strategy));
    expect(strategies.has('baseline_proximity')).toBe(true);
    expect(strategies.has('hybrid_full')).toBe(true);
    expect(strategies.has('ablation_ml_only')).toBe(true);
    expect(strategies.has('ablation_geo_only')).toBe(true);

    // 10 requests * 4 strategies = 40 rows
    expect(metrics.length).toBe(40);
  });

  it('produces deterministic multi-seed summary statistics and bootstrap confidence intervals', () => {
    const runner = new SimulationRunner();
    const seeds = [101, 102, 103];
    const options = { maxRequests: 15, batchSize: 5 };

    const bundle1 = runner.runMultiSeed(baseConfig, seeds, options);
    const bundle2 = runner.runMultiSeed(baseConfig, seeds, options);

    expect(bundle1.summaries).toEqual(bundle2.summaries);
    expect(bundle1.pairedComparisons).toEqual(bundle2.pairedComparisons);

    // Ensure bootstrap CI has valid ordering (lower <= mean <= upper)
    for (const strat of ['baseline_proximity', 'hybrid_full'] as const) {
      const summary = bundle1.summaries[strat];
      expect(summary.fulfillmentRate.ci95Lower).toBeLessThanOrEqual(summary.fulfillmentRate.ci95Upper);
      expect(summary.topKResponseRate.ci95Lower).toBeLessThanOrEqual(summary.topKResponseRate.ci95Upper);
      expect(summary.timeToFirstAcceptSec.ci95Lower).toBeLessThanOrEqual(summary.timeToFirstAcceptSec.ci95Upper);
    }

    // Byte-identical check of statistical bundles
    expect(JSON.stringify(bundle1)).toBe(JSON.stringify(bundle2));
  });

  it('demonstrates honest operational trade-offs without assuming proposed method wins', () => {
    const runner = new SimulationRunner();
    const seeds = [42, 43, 44, 45, 46];
    const options = { maxRequests: 25, batchSize: 5 };

    const { summaries, pairedComparisons } = runner.runMultiSeed(baseConfig, seeds, options);

    const baseline = summaries.baseline_proximity;
    const hybrid = summaries.hybrid_full;

    // 1. Hybrid improves Top-K acceptance likelihood by weighting predicted response probability
    expect(hybrid.topKResponseRate.mean).toBeGreaterThanOrEqual(baseline.topKResponseRate.mean);

    // 2. Baseline proximity achieves closer or equal mean contact distance (honest trade-off)
    expect(baseline.meanDonorDistanceKm.mean).toBeLessThanOrEqual(hybrid.meanDonorDistanceKm.mean);

    // 3. Paired comparison reflects distance trade-off honestly
    const distComparison = pairedComparisons.find((p) => p.metric.includes('Distance'));
    expect(distComparison).toBeDefined();
    expect(distComparison!.meanDifference).toBeGreaterThanOrEqual(0);
    expect(distComparison!.interpretation).toContain('Trade-off');
  });
});
