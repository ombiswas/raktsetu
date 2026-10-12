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

export const BloodComponents = [
  'WHOLE_BLOOD',
  'PACKED_RED_CELLS',
  'PLATELETS',
  'FRESH_FROZEN_PLASMA'
] as const;

export type BloodComponent = (typeof BloodComponents)[number];

/**
 * Red Blood Cell (and Whole Blood) compatibility table.
 * Key: Recipient Blood Group
 * Value: Set of Donor Blood Groups that the recipient can safely receive.
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
 * Plasma compatibility table (Inverted relationship due to antibodies in plasma).
 * AB plasma has neither Anti-A nor Anti-B antibodies (Universal Plasma Donor).
 * O plasma contains both Anti-A and Anti-B antibodies.
 * Key: Recipient Blood Group
 * Value: Set of compatible Donor Blood Groups.
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
 * Returns whether a donor blood group is biologically compatible for a recipient.
 * Hard deterministic check - zero exceptions.
 */
export function isBloodCompatible(
  donorGroup: BloodGroup,
  recipientGroup: BloodGroup,
  component: BloodComponent = 'WHOLE_BLOOD'
): boolean {
  if (component === 'FRESH_FROZEN_PLASMA') {
    const allowed = PLASMA_COMPATIBILITY_MAP[recipientGroup];
    return allowed.has(donorGroup);
  }

  // WHOLE_BLOOD, PACKED_RED_CELLS, and PLATELETS follow cellular compatibility
  const allowed = RBC_COMPATIBILITY_MAP[recipientGroup];
  return allowed.has(donorGroup);
}

/**
 * Returns an array of all donor blood groups compatible with the recipient.
 */
export function getCompatibleDonorBloodGroups(
  recipientGroup: BloodGroup,
  component: BloodComponent = 'WHOLE_BLOOD'
): BloodGroup[] {
  const map =
    component === 'FRESH_FROZEN_PLASMA'
      ? PLASMA_COMPATIBILITY_MAP
      : RBC_COMPATIBILITY_MAP;

  return BloodGroups.filter((g) => map[recipientGroup].has(g));
}
