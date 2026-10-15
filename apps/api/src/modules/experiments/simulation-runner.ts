/**
 * Multi-Strategy Simulation Runner
 * Evaluates candidate dispatch across 4 distinct strategies using production DonorRankers:
 * (a) baseline proximity: ProximityRanker
 * (b) hybrid full: HybridRanker with production weights
 * (c) ablation: ML-only (no geography)
 * (d) ablation: geography-only with eligibility (no ML)
 *
 * Enforces:
 * 1. Hard deterministic constraints evaluated BEFORE ranking.
 * 2. Identical candidate pool per request across all strategies.
 * 3. Seeded ground-truth donor response sampling so strategies face the exact same donor behavior.
 * 4. Production Top-K notification loop with simulated delays and radius expansion.
 */

import { SeededPRNG } from './prng.js';
import {
  ProximityRanker,
  type DonorRanker,
  type CandidateForRanking,
  type RankingRequest
} from '../matching/domain/ranker.js';
import {
  HybridRanker,
  DEFAULT_HYBRID_WEIGHTS,
  type HybridWeightsConfig
} from '../matching/domain/hybrid-ranker.js';
import { isCompatible } from '../matching/domain/compatibility.js';
import {
  computeHaversineDistanceKm,
  calculateDonorAge,
  sigmoid,
  SyntheticDataGenerator
} from './generator.js';
import { TrainedResponsePredictor } from './predictor.js';
import type {
  ExperimentConfig,
  SyntheticDonor,
  StrategyName,
  StrategyRunMetrics,
  StrategySummaryStatistics,
  PairedComparison,
  SensitivitySweepPoint
} from './types.js';
import {
  computeMean,
  computeMedian,
  summarizeStrategy,
  computePairedComparisons
} from './statistics.js';

export interface SimulationRunnerOptions {
  batchSize?: number;
  batchWindowSeconds?: number;
  initialRadiusKm?: number;
  radiusStepKm?: number;
  maxRadiusKm?: number;
  maxBatches?: number;
  maxRequests?: number;
}

export const DEFAULT_RUNNER_OPTIONS: Required<SimulationRunnerOptions> = {
  batchSize: 5,
  batchWindowSeconds: 300, // 5 minutes per batch window
  initialRadiusKm: 5,
  radiusStepKm: 5,
  maxRadiusKm: 25,
  maxBatches: 5,
  maxRequests: 0 // 0 means all requests
};

export function hashSeedTo32Bit(seed: number, str1: string, str2: string): number {
  let h = seed ^ 0x9e3779b9;
  const combined = `${str1}:${str2}`;
  for (let i = 0; i < combined.length; i++) {
    h = Math.imul(h ^ combined.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

interface PreSampledDonorBehavior {
  donor: SyntheticDonor;
  distanceKm: number;
  distanceMeters: number;
  pPredicted: number;
  willAccept: boolean;
  latencySec: number;
}

export class SimulationRunner {
  private readonly predictor: TrainedResponsePredictor;
  private readonly rankers: Record<StrategyName, DonorRanker>;

  constructor(predictor: TrainedResponsePredictor = new TrainedResponsePredictor()) {
    this.predictor = predictor;

    // Production Ranker Configurations
    const mlOnlyConfig: HybridWeightsConfig = {
      version: 'v1.0.0-ablation-ml-only',
      critical: { weightProbability: 1.0, weightAccessibility: 0.0 },
      urgent: { weightProbability: 1.0, weightAccessibility: 0.0 },
      standard: { weightProbability: 1.0, weightAccessibility: 0.0 },
      nominalMaxRadiusMeters: 50000
    };

    const geoOnlyConfig: HybridWeightsConfig = {
      version: 'v1.0.0-ablation-geo-only',
      critical: { weightProbability: 0.0, weightAccessibility: 1.0 },
      urgent: { weightProbability: 0.0, weightAccessibility: 1.0 },
      standard: { weightProbability: 0.0, weightAccessibility: 1.0 },
      nominalMaxRadiusMeters: 50000
    };

    this.rankers = {
      baseline_proximity: new ProximityRanker(),
      hybrid_full: new HybridRanker(DEFAULT_HYBRID_WEIGHTS),
      ablation_ml_only: new HybridRanker(mlOnlyConfig),
      ablation_geo_only: new HybridRanker(geoOnlyConfig)
    };
  }

  /**
   * Runs the simulation for a single seed and returns all per-request metrics across the 4 strategies.
   */
  public runSingleSeed(
    config: ExperimentConfig,
    options: SimulationRunnerOptions = {}
  ): StrategyRunMetrics[] {
    const opts = { ...DEFAULT_RUNNER_OPTIONS, ...options };
    const generator = new SyntheticDataGenerator(config);

    const donors = generator.generateDonors();
    let requests = generator.generateRequests();

    if (opts.maxRequests > 0 && requests.length > opts.maxRequests) {
      requests = requests.slice(0, opts.maxRequests);
    }

    const allMetrics: StrategyRunMetrics[] = [];
    const strategyKeys: StrategyName[] = [
      'baseline_proximity',
      'hybrid_full',
      'ablation_ml_only',
      'ablation_geo_only'
    ];

    const MS_PER_DAY = 86_400_000;

    for (const request of requests) {
      const reqTime = request.timestamp;

      // 1. Stage 1: Deterministic Hard Constraints Filter
      const eligibleCandidates: SyntheticDonor[] = [];

      for (const donor of donors) {
        // Compatibility
        if (!isCompatible(donor.bloodGroup, request.bloodGroup, request.component)) {
          continue;
        }

        // Age
        const age = calculateDonorAge(donor.dateOfBirth, reqTime);
        if (age < 18 || age > 65) {
          continue;
        }

        // Weight
        if (donor.weightKg < 45.0) {
          continue;
        }

        // Donation Cooldown Interval strictly prior to reqTime
        const priorDonations = donor.completedDonations.filter(
          (d) => d.timestamp.getTime() < reqTime.getTime()
        );
        if (priorDonations.length > 0) {
          const recentDonation = priorDonations[priorDonations.length - 1]!;
          const daysSince = (reqTime.getTime() - recentDonation.timestamp.getTime()) / MS_PER_DAY;
          const minDays =
            request.component === 'platelets' ? 14 : donor.sex === 'male' ? 90 : 120;
          if (daysSince < minDays) {
            continue;
          }
        }

        // Geospatial proximity up to maxRadiusKm
        const distKm = computeHaversineDistanceKm(
          donor.latitude,
          donor.longitude,
          request.hospitalLatitude,
          request.hospitalLongitude
        );

        if (distKm <= opts.maxRadiusKm) {
          eligibleCandidates.push(donor);
        }
      }

      if (eligibleCandidates.length === 0) {
        // Record zero-fulfillment for all strategies
        for (const strat of strategyKeys) {
          allMetrics.push({
            strategy: strat,
            requestId: request.id,
            seed: config.seed,
            urgency: request.urgency,
            unitsRequired: request.unitsRequired,
            unitsFulfilled: 0,
            fulfilled: false,
            donorsContacted: 0,
            topKResponseRate: 0,
            timeToFirstAcceptSec: null,
            timeToFulfillmentSec: null,
            meanDonorDistanceKm: 0,
            medianDonorDistanceKm: 0,
            acceptedMeanDistanceKm: null,
            radiusExpansions: 0,
            batchesDispatched: 0
          });
        }
        continue;
      }

      // 2. Pre-evaluate Features, Predicted ML Probabilities, and Ground-Truth Behavioral Outcomes
      // Same candidate set & same seeded PRNG per donor ensures 100% fair evaluation
      const candidateBehaviorMap = new Map<string, PreSampledDonorBehavior>();

      const pParams = config.ground_truth_response;
      const urgencyTerm = pParams.b3_urgency[request.urgency];
      const hourOfDay = reqTime.getUTCHours();
      const nightFlag = hourOfDay >= 22 || hourOfDay < 6 ? 1 : 0;
      const dayOfWeek = (reqTime.getUTCDay() + 6) % 7;
      const isWeekend = dayOfWeek >= 5;

      for (const donor of eligibleCandidates) {
        const distKm = computeHaversineDistanceKm(
          donor.latitude,
          donor.longitude,
          request.hospitalLatitude,
          request.hospitalLongitude
        );
        const distM = Math.round(distKm * 1000);

        // Leakage-safe features prior to reqTime
        const priorAlerts = donor.notificationHistory.filter(
          (n) => n.timestamp.getTime() < reqTime.getTime()
        );
        const priorAlertCount = priorAlerts.length;
        const priorResponseCount = priorAlerts.filter((n) => n.responded).length;
        const priorResponseRate =
          priorAlertCount > 0 ? priorResponseCount / priorAlertCount : pParams.base_rate;

        const priorDonations = donor.completedDonations.filter(
          (d) => d.timestamp.getTime() < reqTime.getTime()
        );
        const totalPastDonations = priorDonations.length;

        let daysSinceLastDonation = 120;
        if (priorDonations.length > 0) {
          const lastDonation = priorDonations[priorDonations.length - 1]!;
          daysSinceLastDonation = Math.min(
            365,
            Math.max(
              0,
              Math.floor((reqTime.getTime() - lastDonation.timestamp.getTime()) / MS_PER_DAY)
            )
          );
        }

        const sevenDaysAgoMs = reqTime.getTime() - 7 * MS_PER_DAY;
        const recentAlertsCount = priorAlerts.filter(
          (n) =>
            n.timestamp.getTime() >= sevenDaysAgoMs && n.timestamp.getTime() < reqTime.getTime()
        ).length;

        const age = calculateDonorAge(donor.dateOfBirth, reqTime);
        const recencyScore = Math.min(1.0, daysSinceLastDonation / 365.0);

        // Predicted probability from trained production model
        const pPredicted = this.predictor.predictSingle({
          donorId: donor.id,
          distanceKm: distKm,
          age,
          hourOfDay,
          urgency: request.urgency,
          isWeekend,
          priorResponseRate,
          historicalResponseRate: priorResponseRate,
          recencyScore,
          totalPastDonations,
          daysSinceLastDonation,
          recentAlertsCount,
          nightFlag
        });

        // Seeded ground-truth latent response function (Fairness stream)
        const donorSeed = hashSeedTo32Bit(config.seed, request.id, donor.id);
        const donorPrng = new SeededPRNG(donorSeed);
        const noise = donorPrng.normal(0, pParams.noise_std);

        const utility =
          pParams.b0_intercept +
          pParams.b1_prior_response_rate * priorResponseRate +
          pParams.b2_recency * recencyScore +
          urgencyTerm -
          pParams.b4_distance_km * distKm +
          pParams.b5_night_flag * nightFlag +
          noise;

        const pGroundTruth = Math.max(0.001, Math.min(0.999, sigmoid(utility)));
        const willAccept = donorPrng.bernoulli(pGroundTruth);
        // Exponential delay: mean 90s, minimum 30s
        const latencySec = Math.round(30 + donorPrng.exponential(1 / 90));

        candidateBehaviorMap.set(donor.id, {
          donor,
          distanceKm: distKm,
          distanceMeters: distM,
          pPredicted,
          willAccept,
          latencySec
        });
      }

      // 3. Evaluate Each Strategy on the Same Request Candidate Pool
      const rankingReq: RankingRequest = {
        id: request.id,
        bloodGroup: request.bloodGroup,
        component: request.component,
        urgency: request.urgency
      };

      for (const strat of strategyKeys) {
        const ranker = this.rankers[strat];
        const contactedIds = new Set<string>();
        const contactedDistances: number[] = [];
        const acceptedDonors: Array<{ donorId: string; acceptTimeSec: number; distanceKm: number }> =
          [];

        let currentRadiusKm = opts.initialRadiusKm;
        let radiusExpansions = 0;
        let batchesDispatched = 0;
        let topKAcceptCount = 0;
        let topKContactCount = 0;

        for (let batch = 1; batch <= opts.maxBatches; batch++) {
          if (acceptedDonors.length >= request.unitsRequired) {
            break;
          }

          // Filter uncontacted candidates within currentRadiusKm
          let available = Array.from(candidateBehaviorMap.values()).filter(
            (c) => !contactedIds.has(c.donor.id) && c.distanceKm <= currentRadiusKm
          );

          // Adaptive Radius Expansion if current pool is exhausted
          while (available.length === 0 && currentRadiusKm < opts.maxRadiusKm) {
            currentRadiusKm = Math.min(opts.maxRadiusKm, currentRadiusKm + opts.radiusStepKm);
            radiusExpansions++;
            available = Array.from(candidateBehaviorMap.values()).filter(
              (c) => !contactedIds.has(c.donor.id) && c.distanceKm <= currentRadiusKm
            );
          }

          if (available.length === 0) {
            break; // No more candidates reachable
          }

          // Rank with production ranker
          const candidatesForRanking: CandidateForRanking[] = available.map((c) => ({
            donorId: c.donor.id,
            distanceMeters: c.distanceMeters,
            bloodGroup: c.donor.bloodGroup,
            pResponse: c.pPredicted
          }));

          const ranked = ranker.rank(candidatesForRanking, rankingReq);
          const batchSlice = ranked.slice(0, opts.batchSize);

          if (batchSlice.length === 0) {
            break;
          }

          batchesDispatched++;
          const batchDispatchTimeSec = (batch - 1) * opts.batchWindowSeconds;

          for (const item of batchSlice) {
            contactedIds.add(item.donorId);
            const behavior = candidateBehaviorMap.get(item.donorId)!;
            contactedDistances.push(behavior.distanceKm);

            if (batch === 1) {
              topKContactCount++;
              if (behavior.willAccept) {
                topKAcceptCount++;
              }
            }

            if (behavior.willAccept && behavior.latencySec <= opts.batchWindowSeconds) {
              acceptedDonors.push({
                donorId: item.donorId,
                acceptTimeSec: batchDispatchTimeSec + behavior.latencySec,
                distanceKm: behavior.distanceKm
              });
            }
          }
        }

        // Process outcome for this strategy
        acceptedDonors.sort((a, b) => a.acceptTimeSec - b.acceptTimeSec);
        const fulfilled = acceptedDonors.length >= request.unitsRequired;
        const unitsFulfilled = Math.min(request.unitsRequired, acceptedDonors.length);

        const timeToFirstAcceptSec =
          acceptedDonors.length > 0 ? acceptedDonors[0]!.acceptTimeSec : null;

        const timeToFulfillmentSec = fulfilled
          ? acceptedDonors[request.unitsRequired - 1]!.acceptTimeSec
          : null;

        const topKResponseRate =
          topKContactCount > 0 ? Number((topKAcceptCount / topKContactCount).toFixed(4)) : 0.0;

        const meanDist = computeMean(contactedDistances);
        const medianDist = computeMedian(contactedDistances);
        const acceptedDistances = acceptedDonors.map((a) => a.distanceKm);
        const acceptedMeanDist =
          acceptedDistances.length > 0 ? computeMean(acceptedDistances) : null;

        allMetrics.push({
          strategy: strat,
          requestId: request.id,
          seed: config.seed,
          urgency: request.urgency,
          unitsRequired: request.unitsRequired,
          unitsFulfilled,
          fulfilled,
          donorsContacted: contactedDistances.length,
          topKResponseRate,
          timeToFirstAcceptSec,
          timeToFulfillmentSec,
          meanDonorDistanceKm: meanDist,
          medianDonorDistanceKm: medianDist,
          acceptedMeanDistanceKm: acceptedMeanDist,
          radiusExpansions,
          batchesDispatched
        });
      }
    }

    return allMetrics;
  }

  /**
   * Runs the simulation over multiple random seeds (e.g., 30) and calculates summary statistics.
   */
  public runMultiSeed(
    baseConfig: ExperimentConfig,
    seeds: number[],
    options: SimulationRunnerOptions = {}
  ): {
    metrics: StrategyRunMetrics[];
    summaries: Record<StrategyName, StrategySummaryStatistics>;
    pairedComparisons: PairedComparison[];
  } {
    const allMetrics: StrategyRunMetrics[] = [];

    for (const seed of seeds) {
      const configForSeed: ExperimentConfig = {
        ...baseConfig,
        seed
      };
      const runMetrics = this.runSingleSeed(configForSeed, options);
      allMetrics.push(...runMetrics);
    }

    const strategyKeys: StrategyName[] = [
      'baseline_proximity',
      'hybrid_full',
      'ablation_ml_only',
      'ablation_geo_only'
    ];

    const summaries = {} as Record<StrategyName, StrategySummaryStatistics>;
    for (const strat of strategyKeys) {
      const filtered = allMetrics.filter((m) => m.strategy === strat);
      summaries[strat] = summarizeStrategy(strat, filtered, seeds[0] ?? 42);
    }

    const baselineRuns = allMetrics.filter((m) => m.strategy === 'baseline_proximity');
    const hybridRuns = allMetrics.filter((m) => m.strategy === 'hybrid_full');
    const pairedComparisons = computePairedComparisons(baselineRuns, hybridRuns, seeds[0] ?? 42);

    return {
      metrics: allMetrics,
      summaries,
      pairedComparisons
    };
  }

  /**
   * Executes sensitivity sweep across 4 key dimensions:
   * 1. Donor Population Size
   * 2. Base Response Rate
   * 3. Noise Standard Deviation
   * 4. Urgency Mix
   */
  public runSensitivitySweeps(
    baseConfig: ExperimentConfig,
    seeds: number[] = [42, 43, 44, 45, 46],
    options: SimulationRunnerOptions = { maxRequests: 30 }
  ): SensitivitySweepPoint[] {
    const points: SensitivitySweepPoint[] = [];

    // Dimension 1: Population Size
    const popSizes = [600, 1200, 2400];
    for (const size of popSizes) {
      const cfg: ExperimentConfig = {
        ...baseConfig,
        population: { ...baseConfig.population, num_donors: size }
      };
      const { summaries } = this.runMultiSeed(cfg, seeds, options);
      for (const strat of ['baseline_proximity', 'hybrid_full'] as StrategyName[]) {
        const s = summaries[strat];
        points.push({
          parameter: 'population_size',
          valueLabel: `${size} donors`,
          strategy: strat,
          fulfillmentRate: s.fulfillmentRate.mean,
          meanTimeToFirstAcceptSec: s.timeToFirstAcceptSec.mean,
          meanTimeToFulfillmentSec: s.timeToFulfillmentSec.mean,
          meanDonorsContacted: s.donorsContacted.mean,
          meanDonorDistanceKm: s.meanDonorDistanceKm.mean,
          topKResponseRate: s.topKResponseRate.mean
        });
      }
    }

    // Dimension 2: Base Response Rate
    const baseRates = [0.15, 0.30, 0.45];
    for (const rate of baseRates) {
      const cfg: ExperimentConfig = {
        ...baseConfig,
        ground_truth_response: { ...baseConfig.ground_truth_response, base_rate: rate }
      };
      const { summaries } = this.runMultiSeed(cfg, seeds, options);
      for (const strat of ['baseline_proximity', 'hybrid_full'] as StrategyName[]) {
        const s = summaries[strat];
        points.push({
          parameter: 'base_response_rate',
          valueLabel: `${(rate * 100).toFixed(0)}% base`,
          strategy: strat,
          fulfillmentRate: s.fulfillmentRate.mean,
          meanTimeToFirstAcceptSec: s.timeToFirstAcceptSec.mean,
          meanTimeToFulfillmentSec: s.timeToFulfillmentSec.mean,
          meanDonorsContacted: s.donorsContacted.mean,
          meanDonorDistanceKm: s.meanDonorDistanceKm.mean,
          topKResponseRate: s.topKResponseRate.mean
        });
      }
    }

    // Dimension 3: Noise Standard Deviation
    const noiseLevels = [0.05, 0.20, 0.40];
    for (const noise of noiseLevels) {
      const cfg: ExperimentConfig = {
        ...baseConfig,
        ground_truth_response: { ...baseConfig.ground_truth_response, noise_std: noise }
      };
      const { summaries } = this.runMultiSeed(cfg, seeds, options);
      for (const strat of ['baseline_proximity', 'hybrid_full'] as StrategyName[]) {
        const s = summaries[strat];
        points.push({
          parameter: 'noise_level',
          valueLabel: `σ=${noise.toFixed(2)}`,
          strategy: strat,
          fulfillmentRate: s.fulfillmentRate.mean,
          meanTimeToFirstAcceptSec: s.timeToFirstAcceptSec.mean,
          meanTimeToFulfillmentSec: s.timeToFulfillmentSec.mean,
          meanDonorsContacted: s.donorsContacted.mean,
          meanDonorDistanceKm: s.meanDonorDistanceKm.mean,
          topKResponseRate: s.topKResponseRate.mean
        });
      }
    }

    // Dimension 4: Urgency Mix
    const urgencyMixes = [
      { label: 'Critical-Heavy (60/30/10)', b3: { CRITICAL: 0.8, URGENT: 0.3, ROUTINE: -0.2 } },
      { label: 'Balanced (25/45/30)', b3: baseConfig.ground_truth_response.b3_urgency },
      { label: 'Routine-Heavy (10/30/60)', b3: { CRITICAL: 0.3, URGENT: 0.1, ROUTINE: -0.4 } }
    ];

    for (const mix of urgencyMixes) {
      const cfg: ExperimentConfig = {
        ...baseConfig,
        ground_truth_response: { ...baseConfig.ground_truth_response, b3_urgency: mix.b3 }
      };
      const { summaries } = this.runMultiSeed(cfg, seeds, options);
      for (const strat of ['baseline_proximity', 'hybrid_full'] as StrategyName[]) {
        const s = summaries[strat];
        points.push({
          parameter: 'urgency_mix',
          valueLabel: mix.label,
          strategy: strat,
          fulfillmentRate: s.fulfillmentRate.mean,
          meanTimeToFirstAcceptSec: s.timeToFirstAcceptSec.mean,
          meanTimeToFulfillmentSec: s.timeToFulfillmentSec.mean,
          meanDonorsContacted: s.donorsContacted.mean,
          meanDonorDistanceKm: s.meanDonorDistanceKm.mean,
          topKResponseRate: s.topKResponseRate.mean
        });
      }
    }

    return points;
  }
}
