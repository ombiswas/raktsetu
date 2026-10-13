import type { FastifyRequest, FastifyReply } from 'fastify';
import type { BloodBanksService } from './blood-banks.service.js';
import type {
  UpdateBloodBankProfileInput,
  RecordDonationInput,
  DeferDonorInput
} from './blood-banks.types.js';

export class BloodBanksController {
  constructor(private readonly service: BloodBanksService) {}

  public async getMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const profile = await this.service.getProfile(request.user!.id);
    return reply.status(200).send(profile);
  }

  public async patchMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const updated = await this.service.updateProfile(
      request.user!.id,
      request.body as UpdateBloodBankProfileInput,
      request.ip
    );
    return reply.status(200).send(updated);
  }

  public async recordDonation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await this.service.recordDonation(
      request.user!.id,
      request.body as RecordDonationInput,
      request.ip
    );
    return reply.status(201).send(result);
  }

  public async deferDonor(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const donorId = request.params.id;
    const result = await this.service.deferDonor(
      request.user!.id,
      donorId,
      request.body as DeferDonorInput,
      request.ip
    );
    return reply.status(200).send(result);
  }
}
