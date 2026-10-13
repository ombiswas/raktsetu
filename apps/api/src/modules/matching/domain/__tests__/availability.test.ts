import { describe, it, expect } from 'vitest';
import { evaluateDonorAvailability } from '../availability.js';

describe('Donor Availability Domain Engine', () => {
  const asOfDate = new Date('2026-10-13T12:00:00.000Z');

  it('marks donor available when isAvailable is true and availableFrom is null', () => {
    const result = evaluateDonorAvailability({ isAvailable: true }, asOfDate);
    expect(result.isAvailable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('marks donor unavailable when isAvailable is false', () => {
    const result = evaluateDonorAvailability({ isAvailable: false }, asOfDate);
    expect(result.isAvailable).toBe(false);
    expect(result.code).toBe('DONOR_PAUSED');
  });

  it('marks donor unavailable when availableFrom is in the future', () => {
    const futureDate = new Date('2026-10-13T18:00:00.000Z');
    const result = evaluateDonorAvailability(
      { isAvailable: true, availableFrom: futureDate },
      asOfDate
    );
    expect(result.isAvailable).toBe(false);
    expect(result.code).toBe('AVAILABLE_FROM_FUTURE');
    expect(result.details?.availableFrom).toBe(futureDate.toISOString());
  });

  it('marks donor available when availableFrom is in the past', () => {
    const pastDate = new Date('2026-10-13T08:00:00.000Z');
    const result = evaluateDonorAvailability(
      { isAvailable: true, availableFrom: pastDate },
      asOfDate
    );
    expect(result.isAvailable).toBe(true);
  });
});
