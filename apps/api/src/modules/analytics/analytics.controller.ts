import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { AnalyticsService } from './analytics.service.js';
import type { analyticsOverviewQuerySchema } from './analytics.schema.js';

type AnalyticsQuery = z.infer<typeof analyticsOverviewQuerySchema>;

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  public async getOverview(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = (req.query ?? {}) as AnalyticsQuery;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const result = await this.service.getOverview({ from, to });
    return reply.status(200).send(result);
  }
}
