import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DonorsService } from './donors.service.js';
import type { UpdateDonorProfileInput, UpdateDonorLocationInput } from './donors.types.js';

export class DonorsController {
  constructor(private readonly service: DonorsService) {}

  public async getMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const profile = await this.service.getProfile(request.user!.id);
    return reply.status(200).send(profile);
  }

  public async patchMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const updated = await this.service.updateProfile(
      request.user!.id,
      request.body as UpdateDonorProfileInput,
      request.ip
    );
    return reply.status(200).send(updated);
  }

  public async putLocation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await this.service.updateLocation(
      request.user!.id,
      request.body as UpdateDonorLocationInput,
      request.ip
    );
    return reply.status(200).send(result);
  }

  public async getDonations(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const history = await this.service.getDonationHistory(request.user!.id);
    return reply.status(200).send(history);
  }
}
