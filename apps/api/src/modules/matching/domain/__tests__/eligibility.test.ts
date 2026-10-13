import { describe, it, expect } from 'vitest';
import {
  evaluateDonorEligibility,
  checkDonationInterval,
  calculateAge,
  DEFAULT_ELIGIBILITY_CONFIG,
  type EligibilityConfig
} from '../eligibility.js';

describe('Donor Eligibility Domain Engine (Boundary & Structured Rules)', () => {
  const refDate = new Date('2026-10-13T00:00:00.000Z');

  describe('Age Calculations and Boundary Conditions', () => {
    it('calculates age boundary: exactly 18 years 0 days -> eligible', () => {
      // Born exactly 18 years prior
      const dob = new Date('2008-10-13T00:00:00.000Z');
      expect(calculateAge(dob, refDate)).toBe(18);

      const result = evaluateDonorEligibility(
        { dateOfBirth: dob, weightKg: 60, sex: 'male' },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('calculates age boundary: 17 years 364 days -> AGE_TOO_LOW rejection', () => {
      // Born 1 day later (17 years and 364 days old)
      const dob = new Date('2008-10-14T00:00:00.000Z');
      expect(calculateAge(dob, refDate)).toBe(17);

      const result = evaluateDonorEligibility(
        { dateOfBirth: dob, weightKg: 60, sex: 'male' },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(false);
      expect(result.reasonCodes).toContain('AGE_TOO_LOW');
      expect(result.reasons[0]?.code).toBe('AGE_TOO_LOW');
      expect(result.reasons[0]?.details?.age).toBe(17);
    });

    it('calculates age boundary: exactly 65 years -> eligible', () => {
      const dob = new Date('1961-10-13T00:00:00.000Z');
      expect(calculateAge(dob, refDate)).toBe(65);

      const result = evaluateDonorEligibility(
        { dateOfBirth: dob, weightKg: 65, sex: 'female' },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(true);
    });

    it('calculates age boundary: 66 years -> AGE_TOO_HIGH rejection', () => {
      const dob = new Date('1960-10-13T00:00:00.000Z');
      expect(calculateAge(dob, refDate)).toBe(66);

      const result = evaluateDonorEligibility(
        { dateOfBirth: dob, weightKg: 65, sex: 'female' },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(false);
      expect(result.reasonCodes).toContain('AGE_TOO_HIGH');
      expect(result.reasons[0]?.details?.age).toBe(66);
    });
  });

  describe('Weight Constraints Boundaries', () => {
    it('accepts donor exactly at 45.0 kg', () => {
      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1998-05-20'),
          weightKg: 45.0,
          sex: 'male'
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(true);
    });

    it('rejects donor at 44.9 kg with WEIGHT_TOO_LOW', () => {
      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1998-05-20'),
          weightKg: 44.9,
          sex: 'male'
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(false);
      expect(result.reasonCodes).toContain('WEIGHT_TOO_LOW');
      expect(result.reasons[0]?.details?.weightKg).toBe(44.9);
    });
  });

  describe('Gender-Differentiated Donation Intervals', () => {
    it('male: exactly 90 days elapsed -> eligible', () => {
      // 90 days before 2026-10-13 is 2026-07-15
      const lastDonation = new Date('2026-07-15T00:00:00.000Z');
      const interval = checkDonationInterval(lastDonation, 'male', 'whole_blood', refDate);
      expect(interval.isAllowed).toBe(true);
      expect(interval.daysRemaining).toBe(0);
      expect(interval.elapsedDays).toBe(90);

      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1995-01-01'),
          weightKg: 70,
          sex: 'male',
          lastDonationDate: lastDonation
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(true);
    });

    it('male: 89 days elapsed -> INTERVAL_COOLDOWN_ACTIVE rejection', () => {
      // 89 days before 2026-10-13 is 2026-07-16
      const lastDonation = new Date('2026-07-16T00:00:00.000Z');
      const interval = checkDonationInterval(lastDonation, 'male', 'whole_blood', refDate);
      expect(interval.isAllowed).toBe(false);
      expect(interval.daysRemaining).toBe(1);

      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1995-01-01'),
          weightKg: 70,
          sex: 'male',
          lastDonationDate: lastDonation
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(false);
      expect(result.reasonCodes).toContain('INTERVAL_COOLDOWN_ACTIVE');
      expect(result.reasons[0]?.details?.daysRemaining).toBe(1);
    });

    it('female: exactly 120 days elapsed -> eligible', () => {
      // 120 days before 2026-10-13 is 2026-06-15
      const lastDonation = new Date('2026-06-15T00:00:00.000Z');
      const interval = checkDonationInterval(lastDonation, 'female', 'whole_blood', refDate);
      expect(interval.isAllowed).toBe(true);
      expect(interval.daysRemaining).toBe(0);
      expect(interval.elapsedDays).toBe(120);

      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1995-01-01'),
          weightKg: 58,
          sex: 'female',
          lastDonationDate: lastDonation
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(true);
    });

    it('female: 119 days elapsed -> INTERVAL_COOLDOWN_ACTIVE rejection', () => {
      const lastDonation = new Date('2026-06-16T00:00:00.000Z');
      const interval = checkDonationInterval(lastDonation, 'female', 'whole_blood', refDate);
      expect(interval.isAllowed).toBe(false);
      expect(interval.daysRemaining).toBe(1);

      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1995-01-01'),
          weightKg: 58,
          sex: 'female',
          lastDonationDate: lastDonation
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(false);
      expect(result.reasonCodes).toContain('INTERVAL_COOLDOWN_ACTIVE');
    });

    it('platelets apheresis cooldown: 14 days vs 13 days', () => {
      const donation14DaysAgo = new Date('2026-09-29T00:00:00.000Z');
      const allowed = checkDonationInterval(donation14DaysAgo, 'male', 'platelets', refDate);
      expect(allowed.isAllowed).toBe(true);

      const donation13DaysAgo = new Date('2026-09-30T00:00:00.000Z');
      const blocked = checkDonationInterval(donation13DaysAgo, 'male', 'platelets', refDate);
      expect(blocked.isAllowed).toBe(false);
      expect(blocked.daysRemaining).toBe(1);
    });
  });

  describe('eligible_after and Medical Deferrals', () => {
    it('rejects donor when eligible_after is strictly in the future', () => {
      const tomorrow = new Date('2026-10-14T00:00:00.000Z');
      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1990-01-01'),
          weightKg: 65,
          eligibleAfter: tomorrow
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(false);
      expect(result.reasonCodes).toContain('ELIGIBLE_AFTER_FUTURE');
    });

    it('accepts donor when eligible_after is today or in the past', () => {
      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1990-01-01'),
          weightKg: 65,
          eligibleAfter: refDate // today
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(true);
    });

    it('rejects donor with active medical deferral flag', () => {
      const result = evaluateDonorEligibility(
        {
          dateOfBirth: new Date('1990-01-01'),
          weightKg: 65,
          hasMedicalDeferral: true,
          deferralReason: 'Recent dental surgery'
        },
        'whole_blood',
        refDate
      );
      expect(result.isEligible).toBe(false);
      expect(result.reasonCodes).toContain('MEDICAL_DEFERRAL_ACTIVE');
      expect(result.reasons[0]?.message).toContain('Recent dental surgery');
    });
  });

  describe('Custom Eligibility Configuration Support', () => {
    it('respects injected custom config thresholds', () => {
      const customConfig: EligibilityConfig = {
        ...DEFAULT_ELIGIBILITY_CONFIG,
        minAgeYears: 21,
        minWeightKg: 50
      };

      const donor = {
        dateOfBirth: new Date('2007-01-01'), // 19 years old
        weightKg: 48,
        sex: 'male'
      };

      // Fails under customConfig
      const customResult = evaluateDonorEligibility(donor, 'whole_blood', refDate, customConfig);
      expect(customResult.isEligible).toBe(false);
      expect(customResult.reasonCodes).toEqual(['AGE_TOO_LOW', 'WEIGHT_TOO_LOW']);

      // Passes under DEFAULT_ELIGIBILITY_CONFIG
      const defaultResult = evaluateDonorEligibility(donor, 'whole_blood', refDate);
      expect(defaultResult.isEligible).toBe(true);
    });
  });
});
