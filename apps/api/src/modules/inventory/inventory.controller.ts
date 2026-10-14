import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { InventoryService } from './inventory.service.js';
import type { adjustInventorySchema } from './inventory.schema.js';

type AdjustInventoryBody = z.infer<typeof adjustInventorySchema>;

export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  public async getMyInventory(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const bloodBankId = req.user!.id;
    const result = await this.service.getInventory(bloodBankId);
    return reply.status(200).send(result);
  }

  public async adjustStock(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const bloodBankId = req.user!.id;
    const body = req.body as AdjustInventoryBody;

    const result = await this.service.adjustStock({
      bloodBankId,
      bloodGroup: body.bloodGroup,
      component: body.component,
      delta: body.delta,
      reason: body.reason,
      requestId: body.requestId,
      actorUserId: req.user!.id,
      ip: req.ip
    });

    return reply.status(200).send(result);
  }
}
