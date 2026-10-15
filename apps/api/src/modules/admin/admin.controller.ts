import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdminService } from './admin.service.js';
import type { ListAccountsQuery, ListAuditLogsQuery } from './admin.types.js';

export class AdminController {
  constructor(private readonly service: AdminService) {}

  public async listAccounts(
    request: FastifyRequest<{ Querystring: ListAccountsQuery }>,
    reply: FastifyReply
  ): Promise<void> {
    const result = await this.service.listAccounts(request.query);
    return reply.status(200).send(result);
  }

  public async approveAccount(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const result = await this.service.approveAccount(
      request.params.id,
      request.user!.id,
      request.ip
    );
    return reply.status(200).send(result);
  }

  public async suspendAccount(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const result = await this.service.suspendAccount(
      request.params.id,
      request.user!.id,
      request.ip
    );
    return reply.status(200).send(result);
  }

  public async reactivateAccount(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const result = await this.service.reactivateAccount(
      request.params.id,
      request.user!.id,
      request.ip
    );
    return reply.status(200).send(result);
  }

  public async listAuditLogs(
    request: FastifyRequest<{ Querystring: ListAuditLogsQuery }>,
    reply: FastifyReply
  ): Promise<void> {
    const result = await this.service.listAuditLogs(request.query);
    return reply.status(200).send(result);
  }
}
