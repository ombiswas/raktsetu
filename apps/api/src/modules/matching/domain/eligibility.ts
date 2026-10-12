/**
 * Donor Eligibility Domain Module (Pure Functions, Zero I/O)
 * Enforces statutory and clinical hard constraints for blood donation.
 */

import { BloodComponent } from './blood-compatibility.js';

export const MIN_AGE_YEARS = 18;
export const MAX_AGE_YEARS = 65;
export const MIN_WEIGHT_KG = 45;
export const MIN_WHOLE_BLOOD_INTERVAL_DAYS = 90;
export const MIN_PLATELETS_INTERVAL_DAYS = 14;

export interface DonorEligibilityInput {
  dateOfBirth: Date;
  weightKg: number;
  lastDonationDate: Date | null;
  hasMedicalDeferral: boolean;
  deferralReason?: string | null;
  isAvailable: boolean;
}

export interface EligibilityResult {
  isEligible: boolean;
  reasons: string[];
}

/**
 * Calculates full age in years given a date of birth and reference date.
 */
export function calculateAge(dob: Date, referenceDate: Date = new Date()): number {
  let age = referenceDate.getFullYear() - dob.getFullYear();
  const monthDiff = referenceDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Validates whether the donor satisfies the statutory age criteria (18-65).
 */
export function isAgeEligible(dob: Date, referenceDate: Date = new Date()): boolean {
  const age = calculateAge(dob, referenceDate);
  return age >= MIN_AGE_YEARS && age <= MAX_AGE_YEARS;
}

/**
 * Validates whether the donor meets the minimum body weight threshold (>= 45kg).
 */
export function isWeightEligible(weightKg: number): boolean {
  return weightKg >= MIN_WEIGHT_KG;
}

/**
 * Validates statutory interval elapsed since the donor's last completed donation.
 * Whole blood requires 90 days (12 weeks).
 * Platelets require 14 days.
 */
export function checkDonationInterval(
  lastDonationDate: Date | null,
  component: BloodComponent = 'WHOLE_BLOOD',
  referenceDate: Date = new Date()
): { isAllowed: boolean; daysRemaining: number } {
  if (!lastDonationDate) {
    return { isAllowed: true, daysRemaining: 0 };
  }

  const requiredIntervalDays =
    component === 'PLATELETS'
      ? MIN_PLATELETS_INTERVAL_DAYS
      : MIN_WHOLE_BLOOD_INTERVAL_DAYS;

  const diffMs = referenceDate.getTime() - lastDonationDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= requiredIntervalDays) {
    return { isAllowed: true, daysRemaining: 0 };
  }

  return {
    isAllowed: false,
    daysRemaining: requiredIntervalDays - diffDays
  };
}

/**
 * Evaluates comprehensive deterministic eligibility for a donor.
 * ALL checks must pass. Zero ML involvement.
 */
export function evaluateDonorEligibility(
  donor: DonorEligibilityInput,
  component: BloodComponent = 'WHOLE_BLOOD',
  referenceDate: Date = new Date()
): EligibilityResult {
  const reasons: string[] = [];

  if (!donor.isAvailable) {
    reasons.push('Donor status is marked unavailable');
  }

  if (donor.hasMedicalDeferral) {
    reasons.push(
      donor.deferralReason
        ? `Medical deferral active: ${donor.deferralReason}`
        : 'Active medical deferral'
    );
  }

  const age = calculateAge(donor.dateOfBirth, referenceDate);
  if (age < MIN_AGE_YEARS) {
    reasons.push(`Under minimum age requirement (age: ${age}, min: ${MIN_AGE_YEARS})`);
  } else if (age > MAX_AGE_YEARS) {
    reasons.push(`Exceeds maximum age limit (age: ${age}, max: ${MAX_AGE_YEARS})`);
  }

  if (!isWeightEligible(donor.weightKg)) {
    reasons.push(
      `Below minimum body weight (weight: ${donor.weightKg}kg, min: ${MIN_WEIGHT_KG}kg)`
    );
  }

  const interval = checkDonationInterval(
    donor.lastDonationDate,
    component,
    referenceDate
  );
  if (!interval.isAllowed) {
    reasons.push(
      `Mandatory donation cooldown in effect (${interval.daysRemaining} days remaining)`
    );
  }

  return {
    isEligible: reasons.length === 0,
    reasons
  };
}
