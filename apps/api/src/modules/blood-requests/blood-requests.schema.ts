import { z } from 'zod';

export const bloodGroupEnumSchema = z.enum([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-'
]);

export const bloodComponentEnumSchema = z.enum([
  'whole_blood',
  'rbc',
  'plasma',
  'platelets'
]);

export const requestUrgencyEnumSchema = z.enum([
  'critical',
  'urgent',
  'standard'
]);

export const requestStatusEnumSchema = z.enum([
  'open',
  'matching',
  'fulfilled',
  'expired',
  'cancelled'
]);

export const geoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

// Maximum future boundary: 30 days
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const createBloodRequestSchema = z
  .object({
    blood_group: bloodGroupEnumSchema.optional(),
    bloodGroup: bloodGroupEnumSchema.optional(),
    component: bloodComponentEnumSchema,
    units_required: z.number().int().min(1, 'Units required must be at least 1').max(20, 'Units required cannot exceed 20').optional(),
    unitsRequired: z.number().int().min(1, 'Units required must be at least 1').max(20, 'Units required cannot exceed 20').optional(),
    urgency: requestUrgencyEnumSchema,
    needed_by: z.string().optional(),
    neededBy: z.string().optional()
  })
  .transform((data) => ({
    bloodGroup: (data.blood_group ?? data.bloodGroup)!,
    component: data.component,
    unitsRequired: (data.units_required ?? data.unitsRequired)!,
    urgency: data.urgency,
    neededBy: (data.needed_by ?? data.neededBy)!
  }))
  .superRefine((data, ctx) => {
    if (!data.bloodGroup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blood_group'],
        message: 'blood_group is required'
      });
    }

    if (data.unitsRequired === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['units_required'],
        message: 'units_required is required'
      });
    }

    if (!data.neededBy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['needed_by'],
        message: 'needed_by is required'
      });
      return;
    }

    const neededByDate = new Date(data.neededBy);
    if (isNaN(neededByDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['needed_by'],
        message: 'needed_by must be a valid ISO datetime'
      });
      return;
    }

    const now = Date.now();
    if (neededByDate.getTime() <= now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['needed_by'],
        message: 'needed_by must be a future datetime'
      });
      return;
    }

    if (neededByDate.getTime() > now + THIRTY_DAYS_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['needed_by'],
        message: 'needed_by must be within 30 days from now'
      });
    }
  });

export const cancelBloodRequestSchema = z.object({
  reason: z.string().max(500).optional()
});
export type CancelBloodRequestInput = z.infer<typeof cancelBloodRequestSchema>;

export const listBloodRequestsQuerySchema = z.object({
  status: requestStatusEnumSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});
export type BloodRequestFilter = z.infer<typeof listBloodRequestsQuerySchema>;

export const hospitalBloodRequestResponseSchema = z.object({
  id: z.string().uuid(),
  hospitalId: z.string().uuid(),
  bloodGroup: bloodGroupEnumSchema,
  component: bloodComponentEnumSchema,
  unitsRequired: z.number().int(),
  unitsFulfilled: z.number().int(),
  urgency: requestUrgencyEnumSchema,
  status: requestStatusEnumSchema,
  neededBy: z.string(),
  location: geoPointSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const hospitalBloodRequestListResponseSchema = z.object({
  requests: z.array(hospitalBloodRequestResponseSchema)
});

export const readOnlyBloodRequestResponseSchema = z.object({
  id: z.string().uuid(),
  hospitalId: z.string().uuid(),
  hospitalName: z.string(),
  hospitalAddress: z.string(),
  bloodGroup: bloodGroupEnumSchema,
  component: bloodComponentEnumSchema,
  unitsRequired: z.number().int(),
  unitsFulfilled: z.number().int(),
  urgency: requestUrgencyEnumSchema,
  status: requestStatusEnumSchema,
  neededBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const readOnlyBloodRequestListResponseSchema = z.object({
  requests: z.array(readOnlyBloodRequestResponseSchema)
});
