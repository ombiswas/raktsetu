/**
 * Blood Compatibility Domain Module (Pure Functions, Zero I/O)
 * Strict deterministic constraint implementation.
 */

export const BloodGroups = [
  'O-',
  'O+',
  'A-',
  'A+',
  'B-',
  'B+',
  'AB-',
  'AB+'
] as const;

export type BloodGroup = (typeof BloodGroups)[number];

export const CanonicalBloodComponents = [
  'whole_blood',
  'rbc',
  'plasma',
  'platelets'
] as const;

export type CanonicalBloodComponent = (typeof CanonicalBloodComponents)[number];

// Support both lowercase (schema) and legacy uppercase constants
export type BloodComponent =
  | CanonicalBloodComponent
  | 'WHOLE_BLOOD'
  | 'PACKED_RED_CELLS'
  | 'FRESH_FROZEN_PLASMA'
  | 'PLATELETS';

/**
 * Normalizes any blood component string representation to canonical lowercase.
 */
export function normalizeBloodComponent(component: BloodComponent | string): CanonicalBloodComponent {
  const normalized = component.toLowerCase().trim();
  switch (normalized) {
    case 'whole_blood':
    case 'packed_red_cells':
    case 'rbc':
      return normalized === 'whole_blood' ? 'whole_blood' : 'rbc';
    case 'fresh_frozen_plasma':
    case 'plasma':
      return 'plasma';
    case 'platelets':
      return 'platelets';
    default:
      if (normalized.includes('plasma')) return 'plasma';
    if (normalized.includes('platelet')) return 'platelets';
    if (normalized.includes('rbc') || normalized.includes('red')) return 'rbc';
    return 'whole_blood';
  }
}

/**
 * Cellular (RBC & Whole Blood) compatibility matrix.
 * Standard ABO/Rh red-cell rules:
 * - O- is universal cellular donor.
 * - AB+ is universal cellular recipient.
 * Key: Recipient Blood Group
 * Value: Set of safe Donor Blood Groups.
 */
const RBC_COMPATIBILITY_MAP: Record<BloodGroup, ReadonlySet<BloodGroup>> = {
  'O-': new Set<BloodGroup>(['O-']),
  'O+': new Set<BloodGroup>(['O-', 'O+']),
  'A-': new Set<BloodGroup>(['O-', 'A-']),
  'A+': new Set<BloodGroup>(['O-', 'O+', 'A-', 'A+']),
  'B-': new Set<BloodGroup>(['O-', 'B-']),
  'B+': new Set<BloodGroup>(['O-', 'O+', 'B-', 'B+']),
  'AB-': new Set<BloodGroup>(['O-', 'A-', 'B-', 'AB-']),
  'AB+': new Set<BloodGroup>(['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'])
};

/**
 * Plasma compatibility matrix.
 * Inverted ABO relationship because plasma contains donor antibodies:
 * - AB plasma contains neither Anti-A nor Anti-B antibodies (Universal Plasma Donor).
 * - O plasma contains both Anti-A and Anti-B antibodies (can only donate to O).
 * Key: Recipient Blood Group
 * Value: Set of safe Donor Blood Groups.
 */
const PLASMA_COMPATIBILITY_MAP: Record<BloodGroup, ReadonlySet<BloodGroup>> = {
  'AB+': new Set<BloodGroup>(['AB+', 'AB-']),
  'AB-': new Set<BloodGroup>(['AB+', 'AB-']),
  'A+': new Set<BloodGroup>(['A+', 'A-', 'AB+', 'AB-']),
  'A-': new Set<BloodGroup>(['A+', 'A-', 'AB+', 'AB-']),
  'B+': new Set<BloodGroup>(['B+', 'B-', 'AB+', 'AB-']),
  'B-': new Set<BloodGroup>(['B+', 'B-', 'AB+', 'AB-']),
  'O+': new Set<BloodGroup>([
    'O+',
    'O-',
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-'
  ]),
  'O-': new Set<BloodGroup>([
    'O+',
    'O-',
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-'
  ])
};

/**
 * Platelet compatibility matrix.
 * Prototype documented simplification:
 * ABO-identical preferred; exact group match enforced for research prototype.
 * Key: Recipient Blood Group
 * Value: Set with only the identical Donor Blood Group.
 */
const PLATELET_COMPATIBILITY_MAP: Record<BloodGroup, ReadonlySet<BloodGroup>> = {
  'O-': new Set<BloodGroup>(['O-']),
  'O+': new Set<BloodGroup>(['O+']),
  'A-': new Set<BloodGroup>(['A-']),
  'A+': new Set<BloodGroup>(['A+']),
  'B-': new Set<BloodGroup>(['B-']),
  'B+': new Set<BloodGroup>(['B+']),
  'AB-': new Set<BloodGroup>(['AB-']),
  'AB+': new Set<BloodGroup>(['AB+'])
};

/**
 * Returns whether a donor blood group is biologically compatible for a recipient.
 * Hard deterministic constraint - zero exceptions.
 */
export function isCompatible(
  donorGroup: BloodGroup,
  recipientGroup: BloodGroup,
  component: BloodComponent = 'whole_blood'
): boolean {
  const canonical = normalizeBloodComponent(component);
  if (canonical === 'plasma') {
    return PLASMA_COMPATIBILITY_MAP[recipientGroup].has(donorGroup);
  }
  if (canonical === 'platelets') {
    return PLATELET_COMPATIBILITY_MAP[recipientGroup].has(donorGroup);
  }
  // whole_blood and rbc follow cellular rules
  return RBC_COMPATIBILITY_MAP[recipientGroup].has(donorGroup);
}

/**
 * Backward compatibility alias for isCompatible.
 */
export const isBloodCompatible = isCompatible;

/**
 * Returns all donor blood groups compatible with the recipient for a given blood component.
 */
export function getCompatibleDonorGroups(
  recipientGroup: BloodGroup,
  component: BloodComponent = 'whole_blood'
): BloodGroup[] {
  const canonical = normalizeBloodComponent(component);
  let map = RBC_COMPATIBILITY_MAP;
  if (canonical === 'plasma') {
    map = PLASMA_COMPATIBILITY_MAP;
  } else if (canonical === 'platelets') {
    map = PLATELET_COMPATIBILITY_MAP;
  }

  return BloodGroups.filter((g) => map[recipientGroup].has(g));
}

/**
 * Backward compatibility alias for getCompatibleDonorGroups.
 */
export const getCompatibleDonorBloodGroups = getCompatibleDonorGroups;
