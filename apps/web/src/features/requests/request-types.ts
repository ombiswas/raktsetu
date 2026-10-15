/**
 * Domain & DTO types for Hospital Emergency Requests and Live Matching
 * Strictly aligns with OpenAPI contract without shared code packages.
 */

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type BloodComponent = 'whole_blood' | 'rbc' | 'plasma' | 'platelets';

export type RequestUrgency = 'critical' | 'urgent' | 'standard';

export type RequestStatus = 'open' | 'matching' | 'fulfilled' | 'expired' | 'cancelled';

export interface BloodRequestItem {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  hospitalAddress?: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  unitsFulfilled: number;
  urgency: RequestUrgency;
  status: RequestStatus;
  neededBy: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MatchingCandidate {
  id: string;
  rank: number;
  bloodGroup: BloodGroup;
  approximateDistance: string;
  responseStatus: 'pending' | 'accepted' | 'declined' | 'no_response';
  score?: number | null | undefined;
  firstName?: string | undefined;
  phone?: string | undefined;
}

export interface MatchingStatusData {
  runId: string;
  requestId: string;
  algorithm: 'baseline' | 'hybrid';
  algorithmVersion: string;
  modelVersion?: string | null;
  degraded?: boolean;
  createdAt: string;
  config: {
    initialRadiusMeters?: number;
    finalRadiusMeters?: number;
    maxRadiusMeters?: number;
    radiusStepMeters?: number;
    minCandidates?: number;
    expansionSteps?: number;
    totalScanned?: number;
    eligibleCount?: number;
    batchSize?: number;
    batchWindowSeconds?: number;
    [key: string]: unknown;
  };
  candidateCounts: {
    total: number;
    pending: number;
    accepted: number;
    declined: number;
    noResponse: number;
  };
  candidates: MatchingCandidate[];
}

export interface CreateBloodRequestInput {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  urgency: RequestUrgency;
  neededBy: string;
}
