/**
 * Response Predictor Interface
 * Application-level abstraction for P(response | donor, request, context) estimation.
 * Decouples matching application logic from HTTP / external ML service implementations.
 */

export interface CandidateFeaturePayload {
  donorId: string;
  distanceKm: number;
  age: number;
  hourOfDay: number;
  urgency: 'CRITICAL' | 'URGENT' | 'ROUTINE';
  isWeekend?: boolean | undefined;
  priorResponseRate?: number | undefined;
  historicalResponseRate?: number | undefined;
  recencyScore?: number | undefined;
  totalPastDonations?: number | undefined;
  daysSinceLastDonation?: number | undefined;
  recentAlertsCount?: number | undefined;
  nightFlag?: number | undefined;
}

export interface PredictBatchRequest {
  requestId: string;
  candidates: CandidateFeaturePayload[];
}

export interface PredictionSuccess {
  readonly isAvailable: true;
  readonly predictions: Map<string, number>; // donorId -> P(response) in [0, 1]
  readonly modelVersion: string;
}

export interface PredictionUnavailable {
  readonly isAvailable: false;
  readonly reason: string;
  readonly circuitOpen?: boolean;
}

export type PredictBatchResult = PredictionSuccess | PredictionUnavailable;

export interface ResponsePredictor {
  predictBatch(request: PredictBatchRequest): Promise<PredictBatchResult>;
}
