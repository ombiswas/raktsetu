import type { FastifyRequest, FastifyReply } from 'fastify';
import type { HospitalsService } from './hospitals.service.js';
import type { UpdateHospitalProfileInput } from './hospitals.types.js';

export class HospitalsController {
  constructor(private readonly service: HospitalsService) {}

  public async getMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const profile = await this.service.getProfile(request.user!.id);
    return reply.status(200).send(profile);
  }

  public async patchMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const updated = await this.service.updateProfile(
      request.user!.id,
      request.body as UpdateHospitalProfileInput,
      request.ip
    );
    return reply.status(200).send(updated);
  }
}
