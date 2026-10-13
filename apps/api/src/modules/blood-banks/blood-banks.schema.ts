import { z } from 'zod';
import { bloodGroupEnumSchema } from '../donors/donors.schema.js';

export const bloodComponentSchema = z.enum(['whole_blood', 'rbc', 'plasma', 'platelets']);

export const updateBloodBankProfileSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format. Must be valid E.164')
      .optional(),
    address: z
      .string()
      .trim()
      .min(5, 'Address must be at least 5 characters')
      .max(300, 'Address cannot exceed 300 characters')
      .optional()
  })
  .strict();

export type UpdateBloodBankProfileSchemaInput = z.infer<typeof updateBloodBankProfileSchema>;

export const recordDonationSchema = z
  .object({
    donorId: z.string().uuid('Invalid donor ID format'),
    bloodGroup: bloodGroupEnumSchema,
    component: bloodComponentSchema,
    units: z
      .number({ invalid_type_error: 'Units must be a number' })
      .int('Units must be an integer')
      .min(1, 'Units must be at least 1')
      .max(10, 'Units cannot exceed 10 per single donation event'),
    requestId: z.string().uuid('Invalid request ID format').optional().nullable(),
    donatedAt: z.string().datetime({ message: 'donatedAt must be an ISO datetime string' }).optional()
  })
  .strict();

export type RecordDonationSchemaInput = z.infer<typeof recordDonationSchema>;

export const deferDonorSchema = z
  .object({
    eligibleAfter: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'eligibleAfter must be in YYYY-MM-DD format'),
    reason: z
      .string()
      .trim()
      .min(3, 'Deferral reason must be at least 3 characters')
      .max(255, 'Deferral reason cannot exceed 255 characters')
  })
  .strict();

export type DeferDonorSchemaInput = z.infer<typeof deferDonorSchema>;

export const bloodBankProfileResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  licenseNo: z.string(),
  phone: z.string(),
  address: z.string(),
  isVerified: z.boolean(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const recordDonationResponseSchema = z.object({
  message: z.string(),
  donation: z.object({
    donationId: z.string().uuid(),
    donorId: z.string().uuid(),
    bloodBankId: z.string().uuid(),
    bloodGroup: bloodGroupEnumSchema,
    component: bloodComponentSchema,
    units: z.number().int(),
    donatedAt: z.string(),
    inventoryTotalUnits: z.number().int()
  })
});

export const deferDonorResponseSchema = z.object({
  message: z.string(),
  deferral: z.object({
    donorId: z.string().uuid(),
    bloodGroup: bloodGroupEnumSchema,
    eligibleAfter: z.string(),
    deferredAt: z.string(),
    reason: z.string()
  })
});
