import { z } from 'zod';

export const updateHospitalProfileSchema = z
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

export type UpdateHospitalProfileSchemaInput = z.infer<typeof updateHospitalProfileSchema>;

export const hospitalProfileResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  registrationNo: z.string(),
  phone: z.string(),
  address: z.string(),
  isVerified: z.boolean(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
