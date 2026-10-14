import { z } from 'zod';

export const analyticsOverviewQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export const requestsByStatusSchema = z.object({
  open: z.number().int().nonnegative(),
  matching: z.number().int().nonnegative(),
  fulfilled: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

export const analyticsOverviewResponseSchema = z.object({
  requestsByStatus: requestsByStatusSchema,
  responseRate: z.number().min(0).max(1),
  medianTimeToFirstAcceptSeconds: z.number().nonnegative(),
  fulfillmentRate: z.number().min(0).max(1),
  radiusExpansionFrequency: z.number().min(0).max(1),
  degradedRunRate: z.number().min(0).max(1),
  totalMatchRuns: z.number().int().nonnegative(),
  totalNotifications: z.number().int().nonnegative(),
  timestamp: z.string()
});
