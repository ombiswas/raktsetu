/**
 * Donor Eligibility Domain Module (Pure Functions, Zero I/O)
 * Strict deterministic constraint implementation for statutory and clinical rules.
 */

import { type BloodComponent, normalizeBloodComponent } from './compatibility.js';

export interface EligibilityConfig {
  readonly minAgeYears: number;          // Statutory minimum age (18)
  readonly maxAgeYears: number;          // Statutory maximum age (65)
  readonly minWeightKg: number;          // Minimum body weight in kg (45)
  readonly minIntervalDaysMale: number;   // Whole blood cooldown for males (90 days)
  readonly minIntervalDaysFemale: number; // Whole blood cooldown for females (120 days)
  readonly minIntervalDaysOther: number;  // Whole blood cooldown for other sex (120 days)
  readonly minPlateletsIntervalDays: number; // Apheresis cooldown (14 days)
}

export const DEFAULT_ELIGIBILITY_CONFIG: EligibilityConfig = {
  minAgeYears: 18,
  maxAgeYears: 65,
  minWeightKg: 45,
  minIntervalDaysMale: 90,
  minIntervalDaysFemale: 120,
  minIntervalDaysOther: 120,
  minPlateletsIntervalDays: 14
};

export type EligibilityRejectionCode =
  | 'AGE_TOO_LOW'
  | 'AGE_TOO_HIGH'
  | 'WEIGHT_TOO_LOW'
  | 'INTERVAL_COOLDOWN_ACTIVE'
  | 'ELIGIBLE_AFTER_FUTURE'
  | 'MEDICAL_DEFERRAL_ACTIVE';

export interface EligibilityRejectionReason {
  code: EligibilityRejectionCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface DonorEligibilityInput {
  dateOfBirth: Date | string;
  weightKg: number;
  sex?: 'male' | 'female' | 'other' | string | null;
  lastDonationDate?: Date | string | null;
  eligibleAfter?: Date | string | null;
  hasMedicalDeferral?: boolean | null;
  deferralReason?: string | null;
}

export interface EligibilityEvaluationResult {
  isEligible: boolean;
  reasons: EligibilityRejectionReason[];
  reasonCodes: EligibilityRejectionCode[];
}

/**
 * Calculates exact full years of age based on UTC dates.
 */
export function calculateAge(dobInput: Date | string, asOfDate: Date = new Date()): number {
  const dob = typeof dobInput === 'string' ? new Date(dobInput) : dobInput;
  let age = asOfDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = asOfDate.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOfDate.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

/**
 * Validates statutory interval elapsed since last completed donation.
 * Male: 90 days (Whole Blood/RBC)
 * Female: 120 days (Whole Blood/RBC)
 * Other: 120 days
 * Platelets: 14 days
 */
export function checkDonationInterval(
  lastDonationDateInput: Date | string | null | undefined,
  sex: 'male' | 'female' | 'other' | string = 'male',
  component: BloodComponent = 'whole_blood',
  asOfDate: Date = new Date(),
  config: EligibilityConfig = DEFAULT_ELIGIBILITY_CONFIG
): { isAllowed: boolean; daysRemaining: number; elapsedDays: number; requiredDays: number } {
  if (!lastDonationDateInput) {
    return { isAllowed: true, daysRemaining: 0, elapsedDays: Infinity, requiredDays: 0 };
  }

  const lastDonation =
    typeof lastDonationDateInput === 'string'
      ? new Date(lastDonationDateInput)
      : lastDonationDateInput;

  const canonical = normalizeBloodComponent(component);
  let requiredDays: number;

  if (canonical === 'platelets') {
    requiredDays = config.minPlateletsIntervalDays;
  } else {
    const normalizedSex = (sex ?? 'male').toLowerCase();
    if (normalizedSex === 'female') {
      requiredDays = config.minIntervalDaysFemale;
    } else if (normalizedSex === 'male') {
      requiredDays = config.minIntervalDaysMale;
    } else {
      requiredDays = config.minIntervalDaysOther;
    }
  }

  const diffMs = asOfDate.getTime() - lastDonation.getTime();
  const elapsedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (elapsedDays >= requiredDays) {
    return { isAllowed: true, daysRemaining: 0, elapsedDays, requiredDays };
  }

  return {
    isAllowed: false,
    daysRemaining: requiredDays - elapsedDays,
    elapsedDays,
    requiredDays
  };
}

/**
 * Evaluates comprehensive deterministic donor eligibility.
 * All checks must pass. Zero ML involvement.
 */
export function evaluateDonorEligibility(
  donor: DonorEligibilityInput,
  component: BloodComponent = 'whole_blood',
  asOfDate: Date = new Date(),
  config: EligibilityConfig = DEFAULT_ELIGIBILITY_CONFIG
): EligibilityEvaluationResult {
  const reasons: EligibilityRejectionReason[] = [];

  // 1. Medical Deferral Flag
  if (donor.hasMedicalDeferral) {
    reasons.push({
      code: 'MEDICAL_DEFERRAL_ACTIVE',
      message: donor.deferralReason
        ? `Active clinical deferral: ${donor.deferralReason}`
        : 'Active clinical deferral',
      details: { deferralReason: donor.deferralReason ?? null }
    });
  }

  // 2. Eligible After Date (must not be in the future relative to asOfDate)
  if (donor.eligibleAfter) {
    const eligibleAfterDate =
      typeof donor.eligibleAfter === 'string'
        ? new Date(donor.eligibleAfter)
        : donor.eligibleAfter;

    // Check if eligibleAfterDate is strictly in the future
    if (eligibleAfterDate.getTime() > asOfDate.getTime()) {
      reasons.push({
        code: 'ELIGIBLE_AFTER_FUTURE',
        message: `Donor is temporarily deferred until ${eligibleAfterDate.toISOString().slice(0, 10)}`,
        details: { eligibleAfter: eligibleAfterDate.toISOString() }
      });
    }
  }

  // 3. Age boundary checks [minAgeYears, maxAgeYears]
  const age = calculateAge(donor.dateOfBirth, asOfDate);
  if (age < config.minAgeYears) {
    reasons.push({
      code: 'AGE_TOO_LOW',
      message: `Donor is under minimum age requirement (${age} years, min: ${config.minAgeYears})`,
      details: { age, minAgeYears: config.minAgeYears }
    });
  } else if (age > config.maxAgeYears) {
    reasons.push({
      code: 'AGE_TOO_HIGH',
      message: `Donor exceeds maximum statutory age (${age} years, max: ${config.maxAgeYears})`,
      details: { age, maxAgeYears: config.maxAgeYears }
    });
  }

  // 4. Weight threshold (>= minWeightKg)
  if (donor.weightKg < config.minWeightKg) {
    reasons.push({
      code: 'WEIGHT_TOO_LOW',
      message: `Donor weight is below statutory threshold (${donor.weightKg} kg, min: ${config.minWeightKg} kg)`,
      details: { weightKg: donor.weightKg, minWeightKg: config.minWeightKg }
    });
  }

  // 5. Cooldown donation interval (90d male / 120d female / 14d platelets)
  const interval = checkDonationInterval(
    donor.lastDonationDate,
    donor.sex ?? 'male',
    component,
    asOfDate,
    config
  );
  if (!interval.isAllowed) {
    reasons.push({
      code: 'INTERVAL_COOLDOWN_ACTIVE',
      message: `Mandatory donation cooldown in effect (${interval.daysRemaining} days remaining of required ${interval.requiredDays} days)`,
      details: {
        daysRemaining: interval.daysRemaining,
        elapsedDays: interval.elapsedDays,
        requiredDays: interval.requiredDays
      }
    });
  }

  return {
    isEligible: reasons.length === 0,
    reasons,
    reasonCodes: reasons.map((r) => r.code)
  };
}
