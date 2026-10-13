import { describe, it, expect } from 'vitest';
import {
  isCompatible,
  isBloodCompatible,
  getCompatibleDonorGroups,
  BloodGroups,
  type BloodGroup
} from '../compatibility.js';

describe('Blood Compatibility Domain Engine (Exhaustive 8x8 Matrices)', () => {
  // Expected Red Cell (RBC & Whole Blood) allowed donors by recipient
  const expectedRbcAllowedDonors: Record<BloodGroup, BloodGroup[]> = {
    'O-': ['O-'],
    'O+': ['O-', 'O+'],
    'A-': ['O-', 'A-'],
    'A+': ['O-', 'O+', 'A-', 'A+'],
    'B-': ['O-', 'B-'],
    'B+': ['O-', 'O+', 'B-', 'B+'],
    'AB-': ['O-', 'A-', 'B-', 'AB-'],
    'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
  };

  // Expected Plasma allowed donors by recipient (Reversed ABO rules)
  const expectedPlasmaAllowedDonors: Record<BloodGroup, BloodGroup[]> = {
    'AB+': ['AB+', 'AB-'],
    'AB-': ['AB+', 'AB-'],
    'A+': ['A+', 'A-', 'AB+', 'AB-'],
    'A-': ['A+', 'A-', 'AB+', 'AB-'],
    'B+': ['B+', 'B-', 'AB+', 'AB-'],
    'B-': ['B+', 'B-', 'AB+', 'AB-'],
    'O+': ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
    'O-': ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
  };

  describe('Whole Blood Exhaustive 8x8 Compatibility', () => {
    for (const recipient of BloodGroups) {
      for (const donor of BloodGroups) {
        const shouldBeCompatible = expectedRbcAllowedDonors[recipient].includes(donor);
        it(`donor ${donor} -> recipient ${recipient} = ${shouldBeCompatible}`, () => {
          expect(isCompatible(donor, recipient, 'whole_blood')).toBe(shouldBeCompatible);
        });
      }
    }
  });

  describe('Packed Red Cells (RBC) Exhaustive 8x8 Compatibility', () => {
    for (const recipient of BloodGroups) {
      for (const donor of BloodGroups) {
        const shouldBeCompatible = expectedRbcAllowedDonors[recipient].includes(donor);
        it(`donor ${donor} -> recipient ${recipient} = ${shouldBeCompatible}`, () => {
          expect(isCompatible(donor, recipient, 'rbc')).toBe(shouldBeCompatible);
          expect(isBloodCompatible(donor, recipient, 'PACKED_RED_CELLS')).toBe(shouldBeCompatible);
        });
      }
    }
  });

  describe('Fresh Frozen Plasma Exhaustive 8x8 Compatibility', () => {
    for (const recipient of BloodGroups) {
      for (const donor of BloodGroups) {
        const shouldBeCompatible = expectedPlasmaAllowedDonors[recipient].includes(donor);
        it(`donor ${donor} -> recipient ${recipient} (plasma) = ${shouldBeCompatible}`, () => {
          expect(isCompatible(donor, recipient, 'plasma')).toBe(shouldBeCompatible);
          expect(isBloodCompatible(donor, recipient, 'FRESH_FROZEN_PLASMA')).toBe(shouldBeCompatible);
        });
      }
    }
  });

  describe('Platelets Exhaustive 8x8 Compatibility (Exact Group Prototype Rule)', () => {
    for (const recipient of BloodGroups) {
      for (const donor of BloodGroups) {
        const shouldBeCompatible = donor === recipient;
        it(`donor ${donor} -> recipient ${recipient} (platelets) = ${shouldBeCompatible}`, () => {
          expect(isCompatible(donor, recipient, 'platelets')).toBe(shouldBeCompatible);
        });
      }
    }
  });

  describe('getCompatibleDonorGroups Helper Verification', () => {
    it('returns exact compatible lists for whole_blood', () => {
      for (const recipient of BloodGroups) {
        const result = getCompatibleDonorGroups(recipient, 'whole_blood');
        expect(result.sort()).toEqual([...expectedRbcAllowedDonors[recipient]].sort());
      }
    });

    it('returns exact compatible lists for plasma', () => {
      for (const recipient of BloodGroups) {
        const result = getCompatibleDonorGroups(recipient, 'plasma');
        expect(result.sort()).toEqual([...expectedPlasmaAllowedDonors[recipient]].sort());
      }
    });

    it('returns single identical group for platelets', () => {
      for (const recipient of BloodGroups) {
        const result = getCompatibleDonorGroups(recipient, 'platelets');
        expect(result).toEqual([recipient]);
      }
    });
  });
});
