/**
 * Donor Feature Builder
 * Pure and leakage-safe feature constructor for ML response estimation.
 * STRICT LEAKAGE RULE:
 * No feature may ever be computed using information from at or after the notification timestamp (asOfDate).
 * Only past donations and past candidate interaction records strictly prior to asOfDate are admitted.
 */

import type { CandidateFeaturePayload } from './response-predictor.interface.js';

export interface DonorHistoricalDonation {
  id: string;
  createdAt: Date;
}

export interface DonorCandidateRecord {
  id: string;
  notifiedAt: Date | null;
  respondedAt: Date | null;
  response: 'pending' | 'accepted' | 'declined' | 'no_response';
}

export interface DonorFeatureBuilderInput {
  donorId: string;
  dateOfBirth: Date;
  distanceMeters: number;
  travelSeconds?: number | null;
  donations: readonly DonorHistoricalDonation[];
  candidateHistory: readonly DonorCandidateRecord[];
}

export interface RequestFeatureContext {
  urgency: 'critical' | 'urgent' | 'standard';
  unitsRequired: number;
  asOfDate: Date;
}

export class DonorFeatureBuilder {
  /**
   * Constructs candidate feature vector strictly bounded by context.asOfDate.
   */
  public static buildFeatures(
    donor: DonorFeatureBuilderInput,
    context: RequestFeatureContext
  ): CandidateFeaturePayload {
    const asOfTime = context.asOfDate.getTime();

    // 1. Calculate Age (bounded strictly by asOfDate)
    const age = Math.min(
      65,
      Math.max(
        18,
        Math.floor((asOfTime - donor.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      )
    );

    // 2. Donation History Leakage Filter: ONLY donations created strictly before asOfDate
    const validDonations = donor.donations.filter((d) => d.createdAt.getTime() < asOfTime);
    const totalPastDonations = validDonations.length;

    let daysSinceLastDonation = 120;
    if (validDonations.length > 0) {
      // Find latest valid donation before asOfDate
      let latestTime = 0;
      for (const d of validDonations) {
        const time = d.createdAt.getTime();
        if (time > latestTime) {
          latestTime = time;
        }
      }
      daysSinceLastDonation = Math.max(
        0,
        Math.floor((asOfTime - latestTime) / (1000 * 60 * 60 * 24))
      );
    }

    // 3. Notification History Leakage Filter: ONLY candidate rows notified strictly before asOfDate
    const validNotifications = donor.candidateHistory.filter(
      (c) => c.notifiedAt !== null && c.notifiedAt.getTime() < asOfTime
    );

    // Recent alerts count (last 7 days prior to asOfDate)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const recentAlertsCount = validNotifications.filter(
      (c) => asOfTime - (c.notifiedAt as Date).getTime() <= sevenDaysMs
    ).length;

    // Prior response rate & mean response time
    // Only count responses that were logged strictly before asOfDate
    const validResponses = validNotifications.filter(
      (c) =>
        c.respondedAt !== null &&
        c.respondedAt.getTime() < asOfTime &&
        (c.response === 'accepted' || c.response === 'declined')
    );

    let priorResponseRate = 0.3; // Default prior
    if (validResponses.length > 0) {
      const acceptedCount = validResponses.filter((c) => c.response === 'accepted').length;
      priorResponseRate = Number((acceptedCount / validResponses.length).toFixed(4));
    }

    // Recency score [0, 1] based on days since latest valid response
    let recencyScore: number | undefined = undefined;
    if (validResponses.length > 0) {
      let latestResponseTime = 0;
      for (const r of validResponses) {
        const time = (r.respondedAt as Date).getTime();
        if (time > latestResponseTime) {
          latestResponseTime = time;
        }
      }
      const daysSinceResponse = Math.max(
        0,
        (asOfTime - latestResponseTime) / (1000 * 60 * 60 * 24)
      );
      recencyScore = Number(Math.max(0, 1 - daysSinceResponse / 90).toFixed(4));
    }

    // 4. Time and Circadian Features
    const hourOfDay = context.asOfDate.getUTCHours();
    const nightFlag = hourOfDay >= 22 || hourOfDay < 6 ? 1 : 0;
    const dayOfWeek = context.asOfDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 5. Urgency normalization
    const urgencyMap: Record<'critical' | 'urgent' | 'standard', 'CRITICAL' | 'URGENT' | 'ROUTINE'> = {
      critical: 'CRITICAL',
      urgent: 'URGENT',
      standard: 'ROUTINE'
    };

    return {
      donorId: donor.donorId,
      distanceKm: Number((donor.distanceMeters / 1000).toFixed(3)),
      age,
      hourOfDay,
      urgency: urgencyMap[context.urgency],
      isWeekend,
      priorResponseRate,
      historicalResponseRate: priorResponseRate,
      recencyScore,
      totalPastDonations,
      daysSinceLastDonation,
      recentAlertsCount,
      nightFlag
    };
  }
}
