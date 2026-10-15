import { z } from 'zod';

export const accountStatusEnumSchema = z.enum(['pending', 'active', 'suspended']);
export const accountRoleEnumSchema = z.enum(['donor', 'hospital', 'blood_bank', 'admin']);

export const listAccountsQuerySchema = z.object({
  status: accountStatusEnumSchema.optional(),
  role: accountRoleEnumSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type ListAccountsQuerySchemaInput = z.infer<typeof listAccountsQuerySchema>;

export const accountIdParamSchema = z.object({
  id: z.string().uuid('Invalid account user ID format')
});

export const adminHospitalDetailsSchema = z.object({
  name: z.string(),
  registrationNo: z.string(),
  phone: z.string(),
  address: z.string(),
  isVerified: z.boolean(),
  verifiedAt: z.string().nullable(),
  verifiedBy: z.string().nullable()
});

export const adminBloodBankDetailsSchema = z.object({
  name: z.string(),
  licenseNo: z.string(),
  phone: z.string(),
  address: z.string(),
  isVerified: z.boolean(),
  verifiedAt: z.string().nullable()
});

export const adminDonorDetailsSchema = z.object({
  fullName: z.string(),
  bloodGroup: z.string(),
  isAvailable: z.boolean(),
  eligibleAfter: z.string().nullable(),
  lastDonationDate: z.string().nullable()
});

export const adminAccountSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: accountRoleEnumSchema,
  status: accountStatusEnumSchema,
  createdAt: z.string(),
  details: z
    .union([adminHospitalDetailsSchema, adminBloodBankDetailsSchema, adminDonorDetailsSchema])
    .nullable()
    .optional()
});

export const adminAccountsListResponseSchema = z.object({
  accounts: z.array(adminAccountSummarySchema)
});

export const adminAccountActionResponseSchema = z.object({
  message: z.string(),
  account: adminAccountSummarySchema
});

export const listAuditLogsQuerySchema = z.object({
  entity: z.string().optional(),
  action: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export type ListAuditLogsQuerySchemaInput = z.infer<typeof listAuditLogsQuerySchema>;

export const auditLogItemSchema = z.object({
  id: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  ipHash: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string()
});

export const adminAuditLogsListResponseSchema = z.object({
  items: z.array(auditLogItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int()
});

