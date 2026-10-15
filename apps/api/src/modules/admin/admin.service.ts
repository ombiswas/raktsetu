import { NotFoundError } from '../../platform/http/errors.js';
import type { AuditService } from '../audit/audit.service.js';
import type {
  IAdminRepository,
  AdminAccountSummary,
  ListAccountsQuery,
  AuditLogItem,
  ListAuditLogsQuery
} from './admin.types.js';

export class AdminService {
  constructor(
    private readonly repository: IAdminRepository,
    private readonly audit?: AuditService
  ) {}

  public async listAccounts(query: ListAccountsQuery): Promise<{ accounts: AdminAccountSummary[] }> {
    const accounts = await this.repository.listAccounts(query);
    return { accounts };
  }

  public async approveAccount(
    userId: string,
    adminUserId: string,
    ip?: string
  ): Promise<{ message: string; account: AdminAccountSummary }> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User account not found');
    }

    const updated = await this.repository.approveAccount(userId, adminUserId);
    if (!updated) {
      throw new NotFoundError('User account not found');
    }

    if (this.audit) {
      await this.audit.record({
        action: 'admin.account.approve',
        entity: 'users',
        entityId: userId,
        actorUserId: adminUserId,
        ip,
        metadata: {
          role: user.role,
          previousStatus: user.status
        }
      });
    }

    return {
      message: 'User account approved successfully',
      account: updated
    };
  }

  public async suspendAccount(
    userId: string,
    adminUserId: string,
    ip?: string
  ): Promise<{ message: string; account: AdminAccountSummary }> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User account not found');
    }

    const updated = await this.repository.suspendAccount(userId);
    if (!updated) {
      throw new NotFoundError('User account not found');
    }

    if (this.audit) {
      await this.audit.record({
        action: 'admin.account.suspend',
        entity: 'users',
        entityId: userId,
        actorUserId: adminUserId,
        ip,
        metadata: {
          role: user.role,
          previousStatus: user.status
        }
      });
    }

    return {
      message: 'User account suspended and all active sessions revoked',
      account: updated
    };
  }

  public async reactivateAccount(
    userId: string,
    adminUserId: string,
    ip?: string
  ): Promise<{ message: string; account: AdminAccountSummary }> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User account not found');
    }

    const updated = await this.repository.reactivateAccount(userId);
    if (!updated) {
      throw new NotFoundError('User account not found');
    }

    if (this.audit) {
      await this.audit.record({
        action: 'admin.account.reactivate',
        entity: 'users',
        entityId: userId,
        actorUserId: adminUserId,
        ip,
        metadata: {
          role: user.role,
          previousStatus: user.status
        }
      });
    }

    return {
      message: 'User account reactivated successfully',
      account: updated
    };
  }

  public async listAuditLogs(
    query: ListAuditLogsQuery
  ): Promise<{ items: AuditLogItem[]; total: number; limit: number; offset: number }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const { items, total } = await this.repository.listAuditLogs({ ...query, limit, offset });
    return { items, total, limit, offset };
  }
}
