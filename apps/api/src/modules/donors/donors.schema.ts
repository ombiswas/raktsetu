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

export const donorSexEnumSchema = z.enum(['male', 'female', 'other']);

// 1. PATCH /v1/donors/me Input Schema
export const updateDonorProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name cannot exceed 100 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format. Must be valid E.164')
      .optional(),
    weightKg: z
      .number({ invalid_type_error: 'Weight must be a valid number' })
      .finite('Weight must be a finite number')
      .min(45, 'Weight must be at least 45 kg for blood donation')
      .max(300, 'Weight must not exceed 300 kg')
      .optional(),
    isAvailable: z.boolean().optional(),
    availableFrom: z.string().datetime({ message: 'availableFrom must be a valid ISO datetime' }).nullable().optional()
  })
  .strict();

export type UpdateDonorProfileSchemaInput = z.infer<typeof updateDonorProfileSchema>;

// 2. PUT /v1/donors/me/location Input Schema
export const updateDonorLocationSchema = z
  .object({
    latitude: z
      .number({ invalid_type_error: 'Latitude must be a valid number' })
      .finite('Latitude must be a finite number')
      .min(-90, 'Latitude must be between -90 and 90 degrees')
      .max(90, 'Latitude must be between -90 and 90 degrees'),
    longitude: z
      .number({ invalid_type_error: 'Longitude must be a valid number' })
      .finite('Longitude must be a finite number')
      .min(-180, 'Longitude must be between -180 and 180 degrees')
      .max(180, 'Longitude must be between -180 and 180 degrees'),
    consentGiven: z.literal(true, {
      errorMap: () => ({ message: 'Explicit user consent is strictly required to store geospatial coordinates' })
    })
  })
  .strict();

export type UpdateDonorLocationSchemaInput = z.infer<typeof updateDonorLocationSchema>;

// 3. Response DTO: Donor's Own Profile (/v1/donors/me)
// Exact coordinates are NEVER returned - only boolean existence and timestamp
export const donorProfileResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string(),
  bloodGroup: bloodGroupEnumSchema,
  dateOfBirth: z.string(),
  weightKg: z.number(),
  sex: donorSexEnumSchema,
  isAvailable: z.boolean(),
  availableFrom: z.string().nullable(),
  eligibleAfter: z.string().nullable(),
  lastDonationDate: z.string().nullable(),
  hasLocation: z.boolean(),
  locationUpdatedAt: z.string().nullable(),
  consentLocationAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

// 4. Response DTO: Location update confirmation
export const donorLocationResponseSchema = z.object({
  message: z.string(),
  locationUpdatedAt: z.string()
});

// 5. Response DTO: Donation History Item
export const donorDonationItemSchema = z.object({
  id: z.string().uuid(),
  bloodBankId: z.string().uuid(),
  bloodBankName: z.string(),
  requestId: z.string().uuid().nullable(),
  donatedAt: z.string(),
  units: z.number().int().positive()
});

export const donorDonationHistoryResponseSchema = z.object({
  donations: z.array(donorDonationItemSchema)
});

// 6. Response DTO: Public/Third-Party Safe Donor (For Hospitals and Blood Banks)
// Must NEVER contain exact coordinates, phone number, date of birth, email, or address
export const donorPublicSafeSchema = z.object({
  id: z.string().uuid(),
  bloodGroup: bloodGroupEnumSchema,
  isAvailable: z.boolean(),
  eligibleAfter: z.string().nullable(),
  lastDonationDate: z.string().nullable()
});
