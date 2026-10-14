import { describe, it, expect } from 'vitest';
import {
  DonorFeatureBuilder,
  type DonorFeatureBuilderInput,
  type RequestFeatureContext
} from '../donor-feature.builder.js';

describe('DonorFeatureBuilder (Leakage-Safe Feature Pipeline)', () => {
  const asOfDate = new Date('2026-10-14T10:00:00.000Z');

  const baseDonor: DonorFeatureBuilderInput = {
    donorId: 'd-test-123',
    dateOfBirth: new Date('1996-04-10T00:00:00.000Z'), // 30 years old as of Oct 2026
    distanceMeters: 4500,
    donations: [
      {
        id: 'don-1',
        createdAt: new Date('2026-06-14T10:00:00.000Z') // 122 days before asOfDate
      },
      {
        id: 'don-2',
        createdAt: new Date('2026-08-15T10:00:00.000Z') // 60 days before asOfDate
      }
    ],
    candidateHistory: [
      {
        id: 'c-1',
        notifiedAt: new Date('2026-09-01T10:00:00.000Z'),
        respondedAt: new Date('2026-09-01T10:15:00.000Z'),
        response: 'accepted'
      },
      {
        id: 'c-2',
        notifiedAt: new Date('2026-09-20T12:00:00.000Z'),
        respondedAt: new Date('2026-09-20T12:30:00.000Z'),
        response: 'declined'
      },
      {
        id: 'c-3',
        notifiedAt: new Date('2026-10-10T08:00:00.000Z'), // within 7 days
        respondedAt: new Date('2026-10-10T08:20:00.000Z'),
        response: 'accepted'
      },
      {
        id: 'c-pending-at-cutoff',
        notifiedAt: new Date('2026-10-14T09:00:00.000Z'), // 1h before asOfDate
        respondedAt: null,
        response: 'pending'
      }
    ]
  };

  const baseContext: RequestFeatureContext = {
    urgency: 'critical',
    unitsRequired: 2,
    asOfDate
  };

  it('correctly constructs pre-notification features from strictly historical data', () => {
    const features = DonorFeatureBuilder.buildFeatures(baseDonor, baseContext);

    expect(features.donorId).toBe('d-test-123');
    expect(features.distanceKm).toBe(4.5);
    expect(features.age).toBe(30);
    expect(features.totalPastDonations).toBe(2);
    expect(features.daysSinceLastDonation).toBe(60); // from 2026-08-15
    expect(features.priorResponseRate).toBeCloseTo(2 / 3, 3); // 2 accepts out of 3 responses
    expect(features.recentAlertsCount).toBe(2); // c-3 and c-pending-at-cutoff within 7 days
    expect(features.urgency).toBe('CRITICAL');
    expect(features.hourOfDay).toBe(10);
    expect(features.nightFlag).toBe(0); // 10:00 UTC is daytime
  });

  it('sets nightFlag to 1 during nighttime hours (>= 22:00 or < 06:00)', () => {
    const nightContext: RequestFeatureContext = {
      ...baseContext,
      asOfDate: new Date('2026-10-14T23:30:00.000Z')
    };

    const features = DonorFeatureBuilder.buildFeatures(baseDonor, nightContext);
    expect(features.nightFlag).toBe(1);
    expect(features.hourOfDay).toBe(23);
  });

  describe('Feature Leakage Boundary Guarantee', () => {
    it('guarantees that mutating or adding later records NEVER alters features calculated as of an earlier timestamp', () => {
      // 1. Compute features at asOfDate
      const featuresBefore = DonorFeatureBuilder.buildFeatures(baseDonor, baseContext);

      // 2. Simulate future events that happen AFTER asOfDate (e.g. 2 hours or days later)
      const futureDonation = {
        id: 'don-future-99',
        createdAt: new Date('2026-10-14T14:00:00.000Z') // 4 hours AFTER asOfDate
      };

      const futureInteraction = {
        id: 'c-future-99',
        notifiedAt: new Date('2026-10-15T09:00:00.000Z'),
        respondedAt: new Date('2026-10-15T09:10:00.000Z'),
        response: 'declined' as const
      };

      // Mutate the pending candidate's response in the future (after asOfDate)
      const updatedCandidateHistory = baseDonor.candidateHistory.map((c) => {
        if (c.id === 'c-pending-at-cutoff') {
          return {
            ...c,
            respondedAt: new Date('2026-10-14T11:30:00.000Z'), // responded AFTER asOfDate (10:00)
            response: 'accepted' as const
          };
        }
        return c;
      });

      const pollutedDonor: DonorFeatureBuilderInput = {
        ...baseDonor,
        donations: [...baseDonor.donations, futureDonation],
        candidateHistory: [...updatedCandidateHistory, futureInteraction]
      };

      // 3. Recompute features using the exact same asOfDate boundary
      const featuresAfter = DonorFeatureBuilder.buildFeatures(pollutedDonor, baseContext);

      // 4. Mathematical proof: features must be strictly identical
      expect(featuresAfter).toEqual(featuresBefore);
      expect(featuresAfter.totalPastDonations).toBe(featuresBefore.totalPastDonations);
      expect(featuresAfter.daysSinceLastDonation).toBe(featuresBefore.daysSinceLastDonation);
      expect(featuresAfter.priorResponseRate).toBe(featuresBefore.priorResponseRate);
    });
  });
});
