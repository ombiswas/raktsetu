import type { FastifyRequest, FastifyReply } from 'fastify';
import type { BloodRequestsService } from './blood-requests.service.js';
import type {
  CreateBloodRequestInput,
  BloodRequestFilter
} from './blood-requests.types.js';
import type { CancelBloodRequestInput } from './blood-requests.schema.js';

export class BloodRequestsController {
  constructor(private readonly service: BloodRequestsService) {}

  public async create(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = req.user!.id;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    const result = await this.service.createRequest(
      userId,
      req.body as CreateBloodRequestInput,
      idempotencyKey
    );

    return reply.status(201).send(result);
  }

  public async getById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const principal = {
      userId: req.user!.id,
      role: req.user!.role
    };

    const result = await this.service.getRequestById(req.params.id, principal);
    return reply.status(200).send(result);
  }

  public async list(
    req: FastifyRequest<{ Querystring: BloodRequestFilter }>,
    reply: FastifyReply
  ): Promise<void> {
    const principal = {
      userId: req.user!.id,
      role: req.user!.role
    };

    const requests = await this.service.listRequests(principal, req.query);
    return reply.status(200).send({ requests });
  }

  public async cancel(
    req: FastifyRequest<{ Params: { id: string }; Body: CancelBloodRequestInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const userId = req.user!.id;
    const reason = req.body?.reason;

    const result = await this.service.cancelRequest(
      req.params.id,
      userId,
      reason
    );

    return reply.status(200).send(result);
  }
}
