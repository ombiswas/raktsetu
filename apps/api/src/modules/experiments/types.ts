import { z } from 'zod';
import type { BloodGroup, BloodComponent } from '../matching/domain/compatibility.js';

export const BloodGroupSchema = z.enum([
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
]);

export const BloodComponentSchema = z.enum([
  'whole_blood', 'rbc', 'plasma', 'platelets'
]);

export const UrgencyLevelSchema = z.enum([
  'CRITICAL', 'URGENT', 'ROUTINE'
]);

export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>;

export const ClusterSchema = z.object({
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  weight: z.number().positive(),
  std_dev_km: z.number().positive(),
});

export const HospitalNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const GroundTruthResponseParamsSchema = z.object({
  b0_intercept: z.number(),
  b1_prior_response_rate: z.number(),
  b2_recency: z.number(),
  b3_urgency: z.object({
    CRITICAL: z.number(),
    URGENT: z.number(),
    ROUTINE: z.number(),
  }),
  b4_distance_km: z.number(),
  b5_night_flag: z.number(),
  noise_std: z.number().nonnegative(),
  base_rate: z.number().min(0).max(1),
});

export type GroundTruthResponseParams = z.infer<typeof GroundTruthResponseParamsSchema>;

export const ExperimentConfigSchema = z.object({
  simulation: z.literal(true),
  disclaimer: z.string(),
  seed: z.number().int(),
  version: z.string(),
  population: z.object({
    num_donors: z.number().int().positive(),
    center: z.object({
      name: z.string(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
    clusters: z.array(ClusterSchema).min(1),
    blood_group_distribution: z.record(BloodGroupSchema, z.number().nonnegative()),
    age_range: z.object({
      min: z.number().int().min(18),
      max: z.number().int().max(65),
    }),
    weight_params: z.object({
      mean: z.number().positive(),
      std_dev: z.number().positive(),
      min: z.number().positive(),
    }),
    male_ratio: z.number().min(0).max(1).default(0.70),
  }),
  timeline: z.object({
    start_date: z.string().datetime(),
    days: z.number().int().positive(),
    requests_per_day_mean: z.number().positive(),
    weekly_pattern: z.array(z.number().positive()).length(7),
    seasonal_surge_factor: z.number().positive(),
  }),
  ground_truth_response: GroundTruthResponseParamsSchema,
  hospitals: z.array(HospitalNodeSchema).min(1),
  max_notification_radius_km: z.number().positive().default(25),
  max_candidates_per_request: z.number().int().positive().default(15),
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;

export interface SyntheticDonor {
  id: string;
  bloodGroup: BloodGroup;
  sex: 'male' | 'female';
  dateOfBirth: string; // ISO date YYYY-MM-DD
  weightKg: number;
  latitude: number;
  longitude: number;
  homeCluster: string;
  completedDonations: Array<{ timestamp: Date; component: BloodComponent }>;
  notificationHistory: Array<{ timestamp: Date; responded: boolean; requestId: string }>;
}

export interface SyntheticRequest {
  id: string;
  timestamp: Date;
  hospitalId: string;
  hospitalName: string;
  hospitalLatitude: number;
  hospitalLongitude: number;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  urgency: UrgencyLevel;
}

export interface DonorNotificationRow {
  notification_id: string;
  request_id: string;
  donor_id: string;
  timestamp: string; // ISO 8601
  distance_km: number;
  prior_response_rate: number;
  recency_score: number;
  total_past_donations: number;
  days_since_last_donation: number;
  recent_alerts_count: number;
  age: number;
  urgency: UrgencyLevel;
  hour_of_day: number;
  is_weekend: boolean;
  night_flag: number; // 0 or 1
  blood_group: BloodGroup;
  component_needed: BloodComponent;
  response: number; // 0 or 1
  simulation: 'SIMULATION';
}

export interface DemandSeriesRow {
  date: string; // YYYY-MM-DD
  blood_group: BloodGroup;
  component: BloodComponent;
  units: number;
  simulation: 'SIMULATION';
}

export interface DatasetMetadata {
  simulation: true;
  disclaimer: string;
  seed: number;
  config_hash: string;
  generator_version: string;
  generated_at: string;
  num_records: number;
  summary_metrics?: Record<string, unknown>;
}
