/**
 * TrainedResponsePredictor
 * High-performance, deterministic in-process implementation of ResponsePredictor.
 * Executes the calibrated scikit-learn LogisticRegression model trained on synthetic data
 * (services/ml/models/response_model.joblib & metadata.json) with zero external process or HTTP overhead.
 */

import type {
  ResponsePredictor,
  PredictBatchRequest,
  PredictBatchResult,
  CandidateFeaturePayload
} from '../matching/application/response-predictor.interface.js';

export const SCALER_MEAN: readonly number[] = [
  2.4966634119124014, 0.5545518203375714, 0.7011424187473824, 2.596735946436044,
  255.91742223462128, 2.9422513600223184, 42.354024271167525, 12.253591853815037,
  0.3109220253870833, 0.13879202120239922, 0.21579020783930813, 0.4678476775003487
];

export const SCALER_SCALE: readonly number[] = [
  1.8171139428106284, 0.3446144782976348, 0.2594532007831725, 1.5894390797534734,
  94.69996015929804, 2.658822880090584, 13.16731120264892, 5.534267511923945,
  0.46287095341607193, 0.3457293682245475, 0.41136941310698166, 0.4989651572583741
];

export const MODEL_INTERCEPT = 0.07501506949581904;

export const MODEL_COEFFICIENTS: readonly number[] = [
  -0.13760152237104148, 0.616565208706897, -0.07109356666155377, -0.05015930609325648,
  -0.07132366250507016, -0.013245330467405886, 0.003930044178249925, -0.010421337476547733,
  -0.019183958498363816, -0.25475012903049343, 0.27727485532816315, 0.1946635808887053
];

export class TrainedResponsePredictor implements ResponsePredictor {
  public readonly modelVersion = 'v0.2.0-calibrated-xgb';

  /**
   * Transforms a single candidate feature payload into the canonical 12-dimensional vector.
   */
  public extractVector(payload: CandidateFeaturePayload): number[] {
    const distanceKm = payload.distanceKm;
    const priorResponseRate =
      payload.priorResponseRate ?? payload.historicalResponseRate ?? 0.3;
    const recencyScore =
      payload.recencyScore ??
      (payload.daysSinceLastDonation !== undefined
        ? Math.min(1.0, payload.daysSinceLastDonation / 365.0)
        : 0.5);
    const totalPastDonations = payload.totalPastDonations ?? 0.0;
    const daysSinceLastDonation = payload.daysSinceLastDonation ?? 120.0;
    const recentAlertsCount = payload.recentAlertsCount ?? 0.0;
    const age = payload.age;
    const hourOfDay = payload.hourOfDay;
    const isWeekend = payload.isWeekend ? 1.0 : 0.0;
    const nightFlag =
      payload.nightFlag !== undefined
        ? payload.nightFlag
        : hourOfDay >= 22 || hourOfDay < 6
          ? 1.0
          : 0.0;
    const urgencyCritical = payload.urgency === 'CRITICAL' ? 1.0 : 0.0;
    const urgencyUrgent = payload.urgency === 'URGENT' ? 1.0 : 0.0;

    return [
      distanceKm,
      priorResponseRate,
      recencyScore,
      totalPastDonations,
      daysSinceLastDonation,
      recentAlertsCount,
      age,
      hourOfDay,
      isWeekend,
      nightFlag,
      urgencyCritical,
      urgencyUrgent
    ];
  }

  /**
   * Computes P(response) for a single candidate feature payload.
   */
  public predictSingle(payload: CandidateFeaturePayload): number {
    const raw = this.extractVector(payload);
    let logit = MODEL_INTERCEPT;

    for (let j = 0; j < 12; j++) {
      const mean = SCALER_MEAN[j]!;
      const scale = SCALER_SCALE[j]!;
      const coef = MODEL_COEFFICIENTS[j]!;
      const z = (raw[j]! - mean) / scale;
      logit += coef * z;
    }

    // Logistic sigmoid
    const prob = 1.0 / (1.0 + Math.exp(-logit));
    // Clamp to [0.01, 0.99] to prevent degeneracies
    return Math.max(0.01, Math.min(0.99, Number(prob.toFixed(4))));
  }

  public async predictBatch(request: PredictBatchRequest): Promise<PredictBatchResult> {
    const predictions = new Map<string, number>();
    for (const c of request.candidates) {
      predictions.set(c.donorId, this.predictSingle(c));
    }

    return {
      isAvailable: true,
      predictions,
      modelVersion: this.modelVersion
    };
  }
}
