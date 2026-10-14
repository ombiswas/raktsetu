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

export const adjustInventorySchema = z.object({
  bloodGroup: bloodGroupEnumSchema,
  component: bloodComponentEnumSchema,
  delta: z
    .number()
    .int('Adjustment delta must be an integer')
    .refine((v) => v !== 0, {
      message: 'Adjustment delta cannot be zero'
    }),
  reason: z
    .string()
    .min(1, 'Reason cannot be empty')
    .max(255, 'Reason must not exceed 255 characters'),
  requestId: z.string().uuid('Invalid blood request UUID').optional()
});

export const inventoryItemResponseSchema = z.object({
  id: z.string().uuid(),
  bloodBankId: z.string().uuid(),
  bloodGroup: bloodGroupEnumSchema,
  component: bloodComponentEnumSchema,
  units: z.number().int().nonnegative(),
  isLowStock: z.boolean(),
  lowStockThreshold: z.number().int().nonnegative(),
  updatedAt: z.string()
});

export const inventoryListResponseSchema = z.object({
  bloodBankId: z.string().uuid(),
  items: z.array(inventoryItemResponseSchema),
  totalUnits: z.number().int().nonnegative(),
  lowStockCount: z.number().int().nonnegative()
});

export const adjustInventoryResponseSchema = z.object({
  inventoryId: z.string().uuid(),
  bloodBankId: z.string().uuid(),
  bloodGroup: bloodGroupEnumSchema,
  component: bloodComponentEnumSchema,
  previousUnits: z.number().int().nonnegative(),
  newUnits: z.number().int().nonnegative(),
  delta: z.number().int(),
  reason: z.string(),
  requestId: z.string().uuid().nullable(),
  movementId: z.string().uuid(),
  isLowStock: z.boolean(),
  lowStockThreshold: z.number().int().nonnegative(),
  createdAt: z.string()
});
