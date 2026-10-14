import { z } from 'zod';

export const bloodGroupValues = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const sexValues = ['male', 'female', 'other'] as const;

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
});

export type LoginFormData = z.infer<typeof loginFormSchema>;

export const donorRegisterFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name cannot exceed 100 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number. Use E.164 format (e.g., +919876543210)'),
  bloodGroup: z.enum(bloodGroupValues, {
    errorMap: () => ({ message: 'Please select a valid blood group' })
  }),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  weightKg: z
    .coerce
    .number({ invalid_type_error: 'Weight must be a valid number' })
    .min(45, 'Weight must be at least 45 kg for blood donation')
    .max(300, 'Weight must not exceed 300 kg'),
  sex: z.enum(sexValues, {
    errorMap: () => ({ message: 'Please select sex' })
  }),
  latitude: z
    .coerce
    .number()
    .min(-90)
    .max(90)
    .default(28.6139),
  longitude: z
    .coerce
    .number()
    .min(-180)
    .max(180)
    .default(77.209)
});

export type DonorRegisterFormData = z.infer<typeof donorRegisterFormSchema>;

export const hospitalRegisterFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Hospital name must be at least 2 characters')
    .max(150, 'Hospital name cannot exceed 150 characters'),
  registrationNo: z
    .string()
    .trim()
    .min(3, 'Registration number must be at least 3 characters')
    .max(50, 'Registration number cannot exceed 50 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  address: z
    .string()
    .trim()
    .min(5, 'Address must be at least 5 characters')
    .max(300, 'Address cannot exceed 300 characters'),
  latitude: z
    .coerce
    .number()
    .min(-90)
    .max(90)
    .default(28.6139),
  longitude: z
    .coerce
    .number()
    .min(-180)
    .max(180)
    .default(77.209)
});

export type HospitalRegisterFormData = z.infer<typeof hospitalRegisterFormSchema>;

export const bloodBankRegisterFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Blood bank name must be at least 2 characters')
    .max(150, 'Blood bank name cannot exceed 150 characters'),
  licenseNo: z
    .string()
    .trim()
    .min(3, 'Drug control license number must be at least 3 characters')
    .max(50, 'License number cannot exceed 50 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  address: z
    .string()
    .trim()
    .min(5, 'Address must be at least 5 characters')
    .max(300, 'Address cannot exceed 300 characters'),
  latitude: z
    .coerce
    .number()
    .min(-90)
    .max(90)
    .default(28.6139),
  longitude: z
    .coerce
    .number()
    .min(-180)
    .max(180)
    .default(77.209)
});

export type BloodBankRegisterFormData = z.infer<typeof bloodBankRegisterFormSchema>;
