import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { ForecastingService } from './forecasting.service.js';
import type { getForecastQuerySchema } from './forecasting.schema.js';

type ForecastQuery = z.infer<typeof getForecastQuerySchema>;

export class ForecastingController {
  constructor(private readonly service: ForecastingService) {}

  public async getForecast(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = req.query as ForecastQuery;

    const result = await this.service.getForecastOverview({
      bloodGroup: query.bloodGroup,
      component: query.component,
      days: query.days
    });

    return reply.status(200).send(result);
  }
}
