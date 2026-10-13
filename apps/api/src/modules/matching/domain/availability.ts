/**
 * Donor Availability Domain Module (Pure Functions, Zero I/O)
 * Evaluates real-time donor availability flags and scheduled active windows.
 */

export interface DonorAvailabilityInput {
  isAvailable: boolean;
  availableFrom?: Date | string | null;
}

export type AvailabilityRejectionCode =
  | 'DONOR_PAUSED'
  | 'AVAILABLE_FROM_FUTURE';

export interface AvailabilityResult {
  isAvailable: boolean;
  reason?: string | undefined;
  code?: AvailabilityRejectionCode | undefined;
  details?: Record<string, unknown> | undefined;
}

/**
 * Evaluates whether a donor is currently available for dispatch.
 * 1. isAvailable must be true.
 * 2. availableFrom, if set, must not be in the future relative to asOfDate.
 */
export function evaluateDonorAvailability(
  donor: DonorAvailabilityInput,
  asOfDate: Date = new Date()
): AvailabilityResult {
  if (!donor.isAvailable) {
    return {
      isAvailable: false,
      code: 'DONOR_PAUSED',
      reason: 'Donor has manually paused their availability status'
    };
  }

  if (donor.availableFrom) {
    const availableFromDate =
      typeof donor.availableFrom === 'string'
        ? new Date(donor.availableFrom)
        : donor.availableFrom;

    if (availableFromDate.getTime() > asOfDate.getTime()) {
      return {
        isAvailable: false,
        code: 'AVAILABLE_FROM_FUTURE',
        reason: `Donor scheduled to resume availability on ${availableFromDate.toISOString()}`,
        details: { availableFrom: availableFromDate.toISOString() }
      };
    }
  }

  return {
    isAvailable: true
  };
}
