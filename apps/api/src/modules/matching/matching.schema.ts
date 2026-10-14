/**
 * Zod Schemas for Matching Module
 */

import { z } from 'zod';

/**
 * Quantizes exact metric distance into privacy-preserving approximate distance bands.
 * E.g. 450m -> "< 1 km", 2400m -> "2-3 km", 7800m -> "7-8 km".
 * Zero coordinates or precise distances leaked.
 */
export function formatDistanceBand(distanceMeters: number): string {
  const km = distanceMeters / 1000;
  if (km < 1) {
    return '< 1 km';
  }
  const lower = Math.floor(km);
  const upper = lower + 1;
  return `${lower}-${upper} km`;
}

export const matchingParamsSchema = z.object({
  id: z.string().uuid({ message: 'Request ID must be a valid UUID' })
});

export type MatchingParams = z.infer<typeof matchingParamsSchema>;

export const matchingCandidateSchema = z.object({
  id: z.string().uuid(),
  rank: z.number().int().positive(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  approximateDistance: z.string(),
  responseStatus: z.enum(['pending', 'accepted', 'declined', 'no_response']),
  score: z.number().nullable(),
  firstName: z.string().optional(),
  phone: z.string().optional()
});

export const matchingStatusResponseSchema = z.object({
  runId: z.string().uuid(),
  requestId: z.string().uuid(),
  algorithm: z.enum(['baseline', 'hybrid']),
  algorithmVersion: z.string(),
  createdAt: z.string(),
  config: z.record(z.unknown()),
  candidateCounts: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    noResponse: z.number().int().nonnegative()
  }),
  candidates: z.array(matchingCandidateSchema)
});

export type MatchingStatusResponse = z.infer<typeof matchingStatusResponseSchema>;

export const respondRequestBodySchema = z.object({
  action: z.enum(['accept', 'decline'])
});

export type RespondRequestBody = z.infer<typeof respondRequestBodySchema>;

export const respondRequestResponseSchema = z.object({
  success: z.boolean(),
  candidateId: z.string().uuid(),
  response: z.enum(['accepted', 'declined']),
  isFulfilled: z.boolean(),
  message: z.string()
});

export type RespondRequestResponse = z.infer<typeof respondRequestResponseSchema>;
