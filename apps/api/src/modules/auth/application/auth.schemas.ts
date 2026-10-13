import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH
} from '../domain/password.js';

export const bloodGroupSchema = z.enum([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-'
]);

export const donorSexSchema = z.enum(['male', 'female', 'other']);

export const geoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);

export const registerDonorSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: passwordSchema,
  fullName: z.string().min(2).max(100),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  bloodGroup: bloodGroupSchema,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  weightKg: z.number().min(45, 'Weight must be at least 45 kg'),
  sex: donorSexSchema,
  location: geoPointSchema
});

export const registerHospitalSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: passwordSchema,
  name: z.string().min(2).max(150),
  registrationNo: z.string().min(3).max(50),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  address: z.string().min(5).max(300),
  location: geoPointSchema
});

export const registerBloodBankSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: passwordSchema,
  name: z.string().min(2).max(150),
  licenseNo: z.string().min(3).max(50),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  address: z.string().min(5).max(300),
  location: geoPointSchema
});

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required')
});

export type RegisterDonorInput = z.infer<typeof registerDonorSchema>;
export type RegisterHospitalInput = z.infer<typeof registerHospitalSchema>;
export type RegisterBloodBankInput = z.infer<typeof registerBloodBankSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
