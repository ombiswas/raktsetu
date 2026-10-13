import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  check,
  unique,
  customType
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Custom PostGIS Geography Type
// ---------------------------------------------------------------------------

export interface GeoPoint {
  longitude: number;
  latitude: number;
}

export const geographyPoint = customType<{
  data: GeoPoint;
  driverData: string;
}>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(value: GeoPoint): string {
    return `SRID=4326;POINT(${value.longitude} ${value.latitude})`;
  },
  fromDriver(value: string): GeoPoint {
    const match = value.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (match && match[1] && match[2]) {
      return {
        longitude: parseFloat(match[1]),
        latitude: parseFloat(match[2])
      };
    }
    return { longitude: 0, latitude: 0 };
  }
});

// ---------------------------------------------------------------------------
// Database Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum('user_role', [
  'donor',
  'hospital',
  'blood_bank',
  'admin'
]);

export const userStatusEnum = pgEnum('user_status', [
  'pending',
  'active',
  'suspended'
]);

export const bloodGroupEnum = pgEnum('blood_group', [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-'
]);

export const donorSexEnum = pgEnum('donor_sex', [
  'male',
  'female',
  'other'
]);

export const bloodComponentEnum = pgEnum('blood_component', [
  'whole_blood',
  'rbc',
  'plasma',
  'platelets'
]);

export const requestUrgencyEnum = pgEnum('request_urgency', [
  'critical',
  'urgent',
  'standard'
]);

export const requestStatusEnum = pgEnum('request_status', [
  'open',
  'matching',
  'fulfilled',
  'expired',
  'cancelled'
]);

export const matchAlgorithmEnum = pgEnum('match_algorithm', [
  'baseline',
  'hybrid'
]);

export const candidateResponseEnum = pgEnum('candidate_response', [
  'pending',
  'accepted',
  'declined',
  'no_response'
]);

// ---------------------------------------------------------------------------
// 1. Users Table
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('pending'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('users_email_unique_idx').on(table.email),
    check('users_email_lowercase_check', sql`${table.email} = lower(${table.email})`)
  ]
);

// ---------------------------------------------------------------------------
// 2. Refresh Tokens Table
// ---------------------------------------------------------------------------

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: text('replaced_by'),
    userAgentHash: text('user_agent_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_unique_idx').on(table.tokenHash),
    index('refresh_tokens_user_id_idx').on(table.userId)
  ]
);

// ---------------------------------------------------------------------------
// 3. Donors Table
// ---------------------------------------------------------------------------

export const donors = pgTable(
  'donors',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    bloodGroup: bloodGroupEnum('blood_group').notNull(),
    dateOfBirth: date('date_of_birth').notNull(),
    weightKg: real('weight_kg').notNull(),
    sex: donorSexEnum('sex').notNull(),
    location: geographyPoint('location').notNull(),
    locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }),
    isAvailable: boolean('is_available').notNull().default(true),
    availableFrom: timestamp('available_from', { withTimezone: true }),
    eligibleAfter: date('eligible_after'),
    lastDonationDate: date('last_donation_date'),
    consentLocationAt: timestamp('consent_location_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('donors_location_gist_idx').using('gist', table.location),
    index('donors_blood_group_available_idx').on(table.bloodGroup, table.isAvailable),
    check('donors_weight_kg_check', sql`${table.weightKg} >= 45`)
  ]
);

// ---------------------------------------------------------------------------
// 4. Hospitals Table
// ---------------------------------------------------------------------------

export const hospitals = pgTable(
  'hospitals',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    registrationNo: text('registration_no').notNull(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    location: geographyPoint('location').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('hospitals_reg_no_unique_idx').on(table.registrationNo),
    index('hospitals_location_gist_idx').using('gist', table.location),
    index('hospitals_verified_by_idx').on(table.verifiedBy)
  ]
);

// ---------------------------------------------------------------------------
// 5. Blood Banks Table
// ---------------------------------------------------------------------------

export const bloodBanks = pgTable(
  'blood_banks',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    licenseNo: text('license_no').notNull(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    location: geographyPoint('location').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('blood_banks_license_no_unique_idx').on(table.licenseNo),
    index('blood_banks_location_gist_idx').using('gist', table.location)
  ]
);

// ---------------------------------------------------------------------------
// 6. Blood Requests Table
// ---------------------------------------------------------------------------

export const bloodRequests = pgTable(
  'blood_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hospitalId: uuid('hospital_id')
      .notNull()
      .references(() => hospitals.userId, { onDelete: 'restrict' }),
    bloodGroup: bloodGroupEnum('blood_group').notNull(),
    component: bloodComponentEnum('component').notNull(),
    unitsRequired: integer('units_required').notNull(),
    unitsFulfilled: integer('units_fulfilled').notNull().default(0),
    urgency: requestUrgencyEnum('urgency').notNull(),
    status: requestStatusEnum('status').notNull().default('open'),
    neededBy: timestamp('needed_by', { withTimezone: true }).notNull(),
    location: geographyPoint('location').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('blood_requests_hospital_id_idx').on(table.hospitalId),
    index('blood_requests_status_idx').on(table.status),
    index('blood_requests_location_gist_idx').using('gist', table.location),
    check('blood_requests_units_required_check', sql`${table.unitsRequired} > 0`),
    check(
      'blood_requests_units_fulfilled_check',
      sql`${table.unitsFulfilled} >= 0 AND ${table.unitsFulfilled} <= ${table.unitsRequired}`
    )
  ]
);

// ---------------------------------------------------------------------------
// 7. Donations Table
// ---------------------------------------------------------------------------

export const donations = pgTable(
  'donations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donorId: uuid('donor_id')
      .notNull()
      .references(() => donors.userId, { onDelete: 'restrict' }),
    bloodBankId: uuid('blood_bank_id')
      .notNull()
      .references(() => bloodBanks.userId, { onDelete: 'restrict' }),
    requestId: uuid('request_id').references(() => bloodRequests.id, { onDelete: 'set null' }),
    donatedAt: timestamp('donated_at', { withTimezone: true }).notNull().defaultNow(),
    units: integer('units').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('donations_donor_id_idx').on(table.donorId),
    index('donations_blood_bank_id_idx').on(table.bloodBankId),
    index('donations_request_id_idx').on(table.requestId),
    check('donations_units_check', sql`${table.units} > 0`)
  ]
);

// ---------------------------------------------------------------------------
// 8. Match Runs Table
// ---------------------------------------------------------------------------

export const matchRuns = pgTable(
  'match_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => bloodRequests.id, { onDelete: 'cascade' }),
    algorithm: matchAlgorithmEnum('algorithm').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    config: jsonb('config').notNull(),
    modelVersion: text('model_version'),
    degraded: boolean('degraded').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('match_runs_request_id_idx').on(table.requestId)]
);

// ---------------------------------------------------------------------------
// 9. Match Candidates Table
// ---------------------------------------------------------------------------

export const matchCandidates = pgTable(
  'match_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => matchRuns.id, { onDelete: 'cascade' }),
    donorId: uuid('donor_id')
      .notNull()
      .references(() => donors.userId, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    score: real('score'),
    pResponse: real('p_response'),
    distanceM: real('distance_m').notNull(),
    travelSeconds: integer('travel_seconds'),
    batchNo: integer('batch_no').notNull().default(1),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    response: candidateResponseEnum('response').notNull().default('pending'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('match_candidates_run_donor_unique').on(table.runId, table.donorId),
    index('match_candidates_run_id_idx').on(table.runId),
    index('match_candidates_donor_id_idx').on(table.donorId)
  ]
);

// ---------------------------------------------------------------------------
// 10. Notifications Table
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('notifications_user_id_idx').on(table.userId)]
);

// ---------------------------------------------------------------------------
// 11. Push Subscriptions Table
// ---------------------------------------------------------------------------

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_unique_idx').on(table.endpoint),
    index('push_subscriptions_user_id_idx').on(table.userId)
  ]
);

// ---------------------------------------------------------------------------
// 12. Blood Inventory Table
// ---------------------------------------------------------------------------

export const bloodInventory = pgTable(
  'blood_inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bloodBankId: uuid('blood_bank_id')
      .notNull()
      .references(() => bloodBanks.userId, { onDelete: 'cascade' }),
    bloodGroup: bloodGroupEnum('blood_group').notNull(),
    component: bloodComponentEnum('component').notNull(),
    units: integer('units').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('blood_inventory_unique_item').on(table.bloodBankId, table.bloodGroup, table.component),
    index('blood_inventory_bank_id_idx').on(table.bloodBankId),
    check('blood_inventory_units_check', sql`${table.units} >= 0`)
  ]
);

// ---------------------------------------------------------------------------
// 13. Inventory Movements Table
// ---------------------------------------------------------------------------

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inventoryId: uuid('inventory_id')
      .notNull()
      .references(() => bloodInventory.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    requestId: uuid('request_id').references(() => bloodRequests.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('inventory_movements_inventory_id_idx').on(table.inventoryId),
    index('inventory_movements_request_id_idx').on(table.requestId),
    check('inventory_movements_delta_check', sql`${table.delta} != 0`)
  ]
);

// ---------------------------------------------------------------------------
// 14. Demand Forecasts Table
// ---------------------------------------------------------------------------

export const demandForecasts = pgTable(
  'demand_forecasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bloodGroup: bloodGroupEnum('blood_group').notNull(),
    component: bloodComponentEnum('component').notNull(),
    horizonStart: timestamp('horizon_start', { withTimezone: true }).notNull(),
    horizonEnd: timestamp('horizon_end', { withTimezone: true }).notNull(),
    predictedUnits: real('predicted_units').notNull(),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check('demand_forecasts_predicted_units_check', sql`${table.predictedUnits} >= 0`)
  ]
);

// ---------------------------------------------------------------------------
// 15. Experiments Table
// ---------------------------------------------------------------------------

export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  config: jsonb('config').notNull(),
  seed: integer('seed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ---------------------------------------------------------------------------
// 16. Experiment Runs Table
// ---------------------------------------------------------------------------

export const experimentRuns = pgTable(
  'experiment_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    strategy: text('strategy').notNull(),
    metrics: jsonb('metrics').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('experiment_runs_experiment_id_idx').on(table.experimentId)]
);

// ---------------------------------------------------------------------------
// 17. Audit Logs Table
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    ipHash: text('ip_hash'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('audit_logs_actor_id_idx').on(table.actorUserId),
    index('audit_logs_created_at_idx').on(table.createdAt)
  ]
);

// ---------------------------------------------------------------------------
// 18. Login Attempts / Lockouts Table
// ---------------------------------------------------------------------------

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    failedCount: integer('failed_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('login_attempts_identifier_unique_idx').on(table.identifier),
    index('login_attempts_locked_until_idx').on(table.lockedUntil)
  ]
);

