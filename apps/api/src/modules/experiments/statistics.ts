/**
 * Statistical Analysis & Bootstrap Confidence Intervals
 * Pure, deterministic functions for experiment metric summarization and paired comparisons.
 */

import { SeededPRNG } from './prng.js';
import type {
  StrategyRunMetrics,
  MetricStatistics,
  StrategySummaryStatistics,
  PairedComparison,
  StrategyName
} from './types.js';

export function computeMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Number((sum / values.length).toFixed(4));
}

export function computeStdDev(values: readonly number[], mean?: number): number {
  if (values.length <= 1) return 0;
  const m = mean ?? computeMean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Number(Math.sqrt(Math.max(0, variance)).toFixed(4));
}

export function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1]! + sorted[mid]!) / 2).toFixed(4));
  }
  return Number(sorted[mid]!.toFixed(4));
}

/**
 * Computes non-parametric 95% bootstrap confidence interval of the sample mean.
 * Resamples with replacement using a deterministic PRNG.
 */
export function computeBootstrapCI(
  values: readonly number[],
  numResamples = 1000,
  alpha = 0.05,
  seed = 42
): { lower: number; upper: number } {
  if (values.length === 0) {
    return { lower: 0, upper: 0 };
  }
  if (values.length === 1) {
    const v = values[0]!;
    return { lower: v, upper: v };
  }

  const prng = new SeededPRNG(seed);
  const resampleMeans: number[] = new Array(numResamples);
  const n = values.length;

  for (let b = 0; b < numResamples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = prng.integer(0, n - 1);
      sum += values[idx]!;
    }
    resampleMeans[b] = sum / n;
  }

  resampleMeans.sort((a, b) => a - b);

  const lowerIdx = Math.max(0, Math.floor(numResamples * (alpha / 2)));
  const upperIdx = Math.min(numResamples - 1, Math.floor(numResamples * (1 - alpha / 2)));

  return {
    lower: Number(resampleMeans[lowerIdx]!.toFixed(4)),
    upper: Number(resampleMeans[upperIdx]!.toFixed(4))
  };
}

export function computeMetricStatistics(values: readonly number[], seed = 42): MetricStatistics {
  const mean = computeMean(values);
  const stdDev = computeStdDev(values, mean);
  const median = computeMedian(values);
  const ci = computeBootstrapCI(values, 1000, 0.05, seed);

  return {
    mean,
    stdDev,
    ci95Lower: ci.lower,
    ci95Upper: ci.upper,
    median
  };
}

export function summarizeStrategy(
  strategy: StrategyName,
  runs: readonly StrategyRunMetrics[],
  seed = 42
): StrategySummaryStatistics {
  const totalRequests = runs.length;
  const fulfillmentValues = runs.map((r) => (r.fulfilled ? 1.0 : 0.0));
  const contactedValues = runs.map((r) => r.donorsContacted);
  const topKValues = runs.map((r) => r.topKResponseRate);
  const meanDistValues = runs.map((r) => r.meanDonorDistanceKm);
  const medianDistValues = runs.map((r) => r.medianDonorDistanceKm);
  const expansionValues = runs.map((r) => r.radiusExpansions);

  // Time metrics filter only successful events where accept occurred
  const ttfaValues = runs
    .filter((r) => r.timeToFirstAcceptSec !== null)
    .map((r) => r.timeToFirstAcceptSec as number);

  const tffValues = runs
    .filter((r) => r.timeToFulfillmentSec !== null)
    .map((r) => r.timeToFulfillmentSec as number);

  return {
    strategy,
    totalRequests,
    fulfillmentRate: computeMetricStatistics(fulfillmentValues, seed + 1),
    donorsContacted: computeMetricStatistics(contactedValues, seed + 2),
    topKResponseRate: computeMetricStatistics(topKValues, seed + 3),
    timeToFirstAcceptSec: computeMetricStatistics(ttfaValues, seed + 4),
    timeToFulfillmentSec: computeMetricStatistics(tffValues, seed + 5),
    meanDonorDistanceKm: computeMetricStatistics(meanDistValues, seed + 6),
    medianDonorDistanceKm: computeMetricStatistics(medianDistValues, seed + 7),
    radiusExpansions: computeMetricStatistics(expansionValues, seed + 8)
  };
}

export function computePairedComparisons(
  baselineRuns: readonly StrategyRunMetrics[],
  hybridRuns: readonly StrategyRunMetrics[],
  seed = 42
): PairedComparison[] {
  // Map by requestId:seed
  const baselineMap = new Map<string, StrategyRunMetrics>();
  for (const b of baselineRuns) {
    baselineMap.set(`${b.requestId}:${b.seed}`, b);
  }

  const pairedTopKDiffs: number[] = [];
  const pairedContactedDiffs: number[] = [];
  const pairedDistDiffs: number[] = [];
  const pairedTtfaDiffs: number[] = [];

  let baselineTopKSum = 0;
  let hybridTopKSum = 0;
  let baselineContactedSum = 0;
  let hybridContactedSum = 0;
  let baselineDistSum = 0;
  let hybridDistSum = 0;
  let baselineTtfaSum = 0;
  let hybridTtfaSum = 0;
  let count = 0;
  let ttfaCount = 0;

  for (const h of hybridRuns) {
    const key = `${h.requestId}:${h.seed}`;
    const b = baselineMap.get(key);
    if (!b) continue;

    count++;
    const topKDiff = h.topKResponseRate - b.topKResponseRate;
    pairedTopKDiffs.push(topKDiff);
    baselineTopKSum += b.topKResponseRate;
    hybridTopKSum += h.topKResponseRate;

    const contactedDiff = h.donorsContacted - b.donorsContacted;
    pairedContactedDiffs.push(contactedDiff);
    baselineContactedSum += b.donorsContacted;
    hybridContactedSum += h.donorsContacted;

    const distDiff = h.meanDonorDistanceKm - b.meanDonorDistanceKm;
    pairedDistDiffs.push(distDiff);
    baselineDistSum += b.meanDonorDistanceKm;
    hybridDistSum += h.meanDonorDistanceKm;

    if (h.timeToFirstAcceptSec !== null && b.timeToFirstAcceptSec !== null) {
      ttfaCount++;
      const ttfaDiff = h.timeToFirstAcceptSec - b.timeToFirstAcceptSec;
      pairedTtfaDiffs.push(ttfaDiff);
      baselineTtfaSum += b.timeToFirstAcceptSec;
      hybridTtfaSum += h.timeToFirstAcceptSec;
    }
  }

  const results: PairedComparison[] = [];

  if (count > 0) {
    // 1. Top-K Response Rate
    const topKMeanDiff = computeMean(pairedTopKDiffs);
    const topKCi = computeBootstrapCI(pairedTopKDiffs, 1000, 0.05, seed + 10);
    results.push({
      metric: 'Top-K Response Rate',
      baselineMean: Number((baselineTopKSum / count).toFixed(4)),
      hybridMean: Number((hybridTopKSum / count).toFixed(4)),
      meanDifference: topKMeanDiff,
      ci95Lower: topKCi.lower,
      ci95Upper: topKCi.upper,
      interpretation:
        topKMeanDiff > 0
          ? `Hybrid full improves Top-K response rate by +${(topKMeanDiff * 100).toFixed(1)}%`
          : `Baseline proximity maintains higher response rate by +${(-topKMeanDiff * 100).toFixed(1)}%`
    });

    // 2. Donors Contacted
    const contactedMeanDiff = computeMean(pairedContactedDiffs);
    const contactedCi = computeBootstrapCI(pairedContactedDiffs, 1000, 0.05, seed + 20);
    results.push({
      metric: 'Donors Contacted Before Fulfillment',
      baselineMean: Number((baselineContactedSum / count).toFixed(4)),
      hybridMean: Number((hybridContactedSum / count).toFixed(4)),
      meanDifference: contactedMeanDiff,
      ci95Lower: contactedCi.lower,
      ci95Upper: contactedCi.upper,
      interpretation:
        contactedMeanDiff < 0
          ? `Hybrid full contacts ${Math.abs(contactedMeanDiff).toFixed(2)} fewer donors per emergency`
          : `Hybrid full contacts ${contactedMeanDiff.toFixed(2)} additional donors per emergency`
    });

    // 3. Contact Distance Trade-off (honest reporting)
    const distMeanDiff = computeMean(pairedDistDiffs);
    const distCi = computeBootstrapCI(pairedDistDiffs, 1000, 0.05, seed + 30);
    results.push({
      metric: 'Mean Contact Distance (km)',
      baselineMean: Number((baselineDistSum / count).toFixed(4)),
      hybridMean: Number((hybridDistSum / count).toFixed(4)),
      meanDifference: distMeanDiff,
      ci95Lower: distCi.lower,
      ci95Upper: distCi.upper,
      interpretation:
        distMeanDiff > 0
          ? `Trade-off: Hybrid prioritizes responsiveness over pure proximity (+${distMeanDiff.toFixed(2)} km farther on average)`
          : `Hybrid achieves closer average contact distance (-${Math.abs(distMeanDiff).toFixed(2)} km)`
    });
  }

  if (ttfaCount > 0) {
    // 4. Time to First Accept
    const ttfaMeanDiff = computeMean(pairedTtfaDiffs);
    const ttfaCi = computeBootstrapCI(pairedTtfaDiffs, 1000, 0.05, seed + 40);
    results.push({
      metric: 'Time to First Acceptance (seconds)',
      baselineMean: Number((baselineTtfaSum / ttfaCount).toFixed(2)),
      hybridMean: Number((hybridTtfaSum / ttfaCount).toFixed(2)),
      meanDifference: ttfaMeanDiff,
      ci95Lower: ttfaCi.lower,
      ci95Upper: ttfaCi.upper,
      interpretation:
        ttfaMeanDiff < 0
          ? `Hybrid full achieves first acceptance ${Math.abs(ttfaMeanDiff).toFixed(1)}s faster`
          : `Baseline proximity achieves first acceptance ${ttfaMeanDiff.toFixed(1)}s faster`
    });
  }

  return results;
}
