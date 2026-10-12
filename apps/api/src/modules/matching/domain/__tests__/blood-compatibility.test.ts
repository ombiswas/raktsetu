import { describe, it, expect } from 'vitest';
import {
  isBloodCompatible,
  getCompatibleDonorBloodGroups,
  BloodGroups
} from '../blood-compatibility.js';

describe('Blood Compatibility Domain Engine (Deterministic Rules)', () => {
  describe('Red Blood Cells / Whole Blood Compatibility', () => {
    it('O- recipient can ONLY receive from O- donor', () => {
      expect(isBloodCompatible('O-', 'O-', 'WHOLE_BLOOD')).toBe(true);
      expect(isBloodCompatible('O+', 'O-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('A-', 'O-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('A+', 'O-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('B-', 'O-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('B+', 'O-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('AB-', 'O-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('AB+', 'O-', 'WHOLE_BLOOD')).toBe(false);
    });

    it('O- donor is universal donor for cellular components', () => {
      for (const recipient of BloodGroups) {
        expect(isBloodCompatible('O-', recipient, 'WHOLE_BLOOD')).toBe(true);
        expect(isBloodCompatible('O-', recipient, 'PACKED_RED_CELLS')).toBe(true);
      }
    });

    it('AB+ recipient is universal recipient for cellular components', () => {
      for (const donor of BloodGroups) {
        expect(isBloodCompatible(donor, 'AB+', 'WHOLE_BLOOD')).toBe(true);
        expect(isBloodCompatible(donor, 'AB+', 'PACKED_RED_CELLS')).toBe(true);
      }
    });

    it('A+ recipient can receive from O-, O+, A-, A+', () => {
      const compatible = getCompatibleDonorBloodGroups('A+', 'WHOLE_BLOOD');
      expect(compatible.sort()).toEqual(['A+', 'A-', 'O+', 'O-'].sort());
    });

    it('B- recipient can receive from O- and B- only', () => {
      const compatible = getCompatibleDonorBloodGroups('B-', 'WHOLE_BLOOD');
      expect(compatible.sort()).toEqual(['B-', 'O-'].sort());
    });

    it('AB- recipient cannot receive Rh+ blood', () => {
      expect(isBloodCompatible('O+', 'AB-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('A+', 'AB-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('B+', 'AB-', 'WHOLE_BLOOD')).toBe(false);
      expect(isBloodCompatible('AB+', 'AB-', 'WHOLE_BLOOD')).toBe(false);

      expect(isBloodCompatible('O-', 'AB-', 'WHOLE_BLOOD')).toBe(true);
      expect(isBloodCompatible('A-', 'AB-', 'WHOLE_BLOOD')).toBe(true);
      expect(isBloodCompatible('B-', 'AB-', 'WHOLE_BLOOD')).toBe(true);
      expect(isBloodCompatible('AB-', 'AB-', 'WHOLE_BLOOD')).toBe(true);
    });
  });

  describe('Fresh Frozen Plasma Compatibility (Inverted Rules)', () => {
    it('AB donors are universal plasma donors', () => {
      for (const recipient of BloodGroups) {
        expect(isBloodCompatible('AB+', recipient, 'FRESH_FROZEN_PLASMA')).toBe(true);
        expect(isBloodCompatible('AB-', recipient, 'FRESH_FROZEN_PLASMA')).toBe(true);
      }
    });

    it('O recipient can receive plasma from any group', () => {
      const compatible = getCompatibleDonorBloodGroups('O+', 'FRESH_FROZEN_PLASMA');
      expect(compatible.length).toBe(BloodGroups.length);
    });

    it('AB recipient cannot receive plasma from A, B, or O donors', () => {
      expect(isBloodCompatible('O-', 'AB+', 'FRESH_FROZEN_PLASMA')).toBe(false);
      expect(isBloodCompatible('A+', 'AB+', 'FRESH_FROZEN_PLASMA')).toBe(false);
      expect(isBloodCompatible('B+', 'AB+', 'FRESH_FROZEN_PLASMA')).toBe(false);
    });
  });
});
