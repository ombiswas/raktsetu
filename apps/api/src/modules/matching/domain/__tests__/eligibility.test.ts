import { describe, it, expect } from 'vitest';
import {
  evaluateDonorEligibility,
  checkDonationInterval,
  calculateAge,
  MIN_AGE_YEARS,
  MAX_AGE_YEARS,
  MIN_WEIGHT_KG,
  MIN_WHOLE_BLOOD_INTERVAL_DAYS
} from '../eligibility.js';

describe('Donor Eligibility Domain Engine (Statutory Constraints)', () => {
  const refDate = new Date('2026-10-12T00:00:00Z');

  describe('Age Calculations and Thresholds', () => {
    it('calculates age correctly across leap years and months', () => {
      expect(calculateAge(new Date('2006-10-12'), refDate)).toBe(20);
      expect(calculateAge(new Date('2006-10-13'), refDate)).toBe(19);
      expect(calculateAge(new Date('1961-10-12'), refDate)).toBe(65);
      expect(calculateAge(new Date('1961-10-11'), refDate)).toBe(65);
      expect(calculateAge(new Date('1961-10-01'), refDate)).toBe(65);
    });

    it('rejects donor under 18 years', () => {
      const donor = {
        dateOfBirth: new Date('2009-01-01'), // 17 years old
        weightKg: 65,
        lastDonationDate: null,
        hasMedicalDeferral: false,
        isAvailable: true
      };
      const result = evaluateDonorEligibility(donor, 'WHOLE_BLOOD', refDate);
      expect(result.isEligible).toBe(false);
      expect(result.reasons.some((r) => r.includes(`min: ${MIN_AGE_YEARS}`))).toBe(true);
    });

    it('rejects donor over 65 years', () => {
      const donor = {
        dateOfBirth: new Date('1960-01-01'), // 66 years old
        weightKg: 70,
        lastDonationDate: null,
        hasMedicalDeferral: false,
        isAvailable: true
      };
      const result = evaluateDonorEligibility(donor, 'WHOLE_BLOOD', refDate);
      expect(result.isEligible).toBe(false);
      expect(result.reasons.some((r) => r.includes(`max: ${MAX_AGE_YEARS}`))).toBe(true);
    });
  });

  describe('Weight Constraints', () => {
    it('rejects donor below 45kg', () => {
      const donor = {
        dateOfBirth: new Date('2000-01-01'),
        weightKg: 44.5,
        lastDonationDate: null,
        hasMedicalDeferral: false,
        isAvailable: true
      };
      const result = evaluateDonorEligibility(donor, 'WHOLE_BLOOD', refDate);
      expect(result.isEligible).toBe(false);
      expect(result.reasons.some((r) => r.includes(`min: ${MIN_WEIGHT_KG}kg`))).toBe(true);
    });

    it('accepts donor exactly at 45kg or above', () => {
      const donor = {
        dateOfBirth: new Date('2000-01-01'),
        weightKg: 45.0,
        lastDonationDate: null,
        hasMedicalDeferral: false,
        isAvailable: true
      };
      const result = evaluateDonorEligibility(donor, 'WHOLE_BLOOD', refDate);
      expect(result.isEligible).toBe(true);
      expect(result.reasons).toEqual([]);
    });
  });

  describe('Donation Interval / Cooldown Period', () => {
    it('allows donation if donor has never donated before', () => {
      const interval = checkDonationInterval(null, 'WHOLE_BLOOD', refDate);
      expect(interval.isAllowed).toBe(true);
      expect(interval.daysRemaining).toBe(0);
    });

    it('blocks whole blood donation if less than 90 days have elapsed', () => {
      // 60 days ago
      const lastDonation = new Date('2026-08-13T00:00:00Z');
      const interval = checkDonationInterval(lastDonation, 'WHOLE_BLOOD', refDate);
      expect(interval.isAllowed).toBe(false);
      expect(interval.daysRemaining).toBe(30);

      const donor = {
        dateOfBirth: new Date('1995-05-15'),
        weightKg: 72,
        lastDonationDate: lastDonation,
        hasMedicalDeferral: false,
        isAvailable: true
      };
      const result = evaluateDonorEligibility(donor, 'WHOLE_BLOOD', refDate);
      expect(result.isEligible).toBe(false);
      expect(result.reasons.some((r) => r.includes('cooldown'))).toBe(true);
    });

    it('allows whole blood donation if exactly 90 days have elapsed', () => {
      const lastDonation = new Date(refDate.getTime() - MIN_WHOLE_BLOOD_INTERVAL_DAYS * 24 * 3600 * 1000);
      const interval = checkDonationInterval(lastDonation, 'WHOLE_BLOOD', refDate);
      expect(interval.isAllowed).toBe(true);
      expect(interval.daysRemaining).toBe(0);
    });
  });

  describe('Availability & Medical Deferrals', () => {
    it('rejects donor if isAvailable is false', () => {
      const donor = {
        dateOfBirth: new Date('1998-01-01'),
        weightKg: 68,
        lastDonationDate: null,
        hasMedicalDeferral: false,
        isAvailable: false
      };
      const result = evaluateDonorEligibility(donor, 'WHOLE_BLOOD', refDate);
      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('Donor status is marked unavailable');
    });

    it('rejects donor if hasMedicalDeferral is true', () => {
      const donor = {
        dateOfBirth: new Date('1998-01-01'),
        weightKg: 68,
        lastDonationDate: null,
        hasMedicalDeferral: true,
        deferralReason: 'Recent dental surgery within 72 hours',
        isAvailable: true
      };
      const result = evaluateDonorEligibility(donor, 'WHOLE_BLOOD', refDate);
      expect(result.isEligible).toBe(false);
      expect(result.reasons[0]).toContain('Recent dental surgery');
    });
  });
});
