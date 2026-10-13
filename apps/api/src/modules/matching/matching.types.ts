/**
 * Matching Module TypeScript Domain & DTO Types
 */

import type { BloodGroup } from './domain/compatibility.js';

export interface MatchingCandidateView {
  id: string; // Match candidate record UUID (not donor user ID)
  rank: number;
  bloodGroup: BloodGroup;
  approximateDistance: string; // e.g. "2-3 km", "< 1 km"
  responseStatus: 'pending' | 'accepted' | 'declined' | 'no_response';
  score: number | null;
}

export interface MatchingRunCandidateCounts {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
  noResponse: number;
}

export interface MatchingStatusView {
  runId: string;
  requestId: string;
  algorithm: 'baseline' | 'hybrid';
  algorithmVersion: string;
  createdAt: string;
  config: Record<string, unknown>;
  candidateCounts: MatchingRunCandidateCounts;
  candidates: MatchingCandidateView[];
}
