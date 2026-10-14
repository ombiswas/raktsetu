import { z } from 'zod';
import {
  bloodComponentEnumSchema,
  bloodGroupEnumSchema
} from '../inventory/inventory.schema.js';

export const getForecastQuerySchema = z.object({
  bloodGroup: bloodGroupEnumSchema.default('O+'),
  component: bloodComponentEnumSchema.default('whole_blood'),
  days: z.coerce.number().int().min(7).max(365).default(30)
});

export const timeSeriesPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  units: z.number().nonnegative()
});

export const forecastPointSchema = z.object({
  step: z.number().int(),
  date: z.string(),
  predictedUnits: z.number().nonnegative()
});

export const forecastOverviewResponseSchema = z.object({
  bloodGroup: bloodGroupEnumSchema,
  component: bloodComponentEnumSchema,
  modelVersion: z.string(),
  series: z.array(timeSeriesPointSchema),
  forecast: z.array(forecastPointSchema),
  isSimulation: z.literal(true)
});
