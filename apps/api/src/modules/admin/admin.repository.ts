import { eq, and, desc, sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import {
  users,
  hospitals,
  bloodBanks,
  donors,
  refreshTokens,
  auditLogs
} from '../../platform/database/schema.js';
import type {
  IAdminRepository,
  AdminAccountSummary,
  ListAccountsQuery,
  AccountRole,
  AccountStatus,
  AuditLogItem,
  ListAuditLogsQuery
} from './admin.types.js';

export class AdminRepository implements IAdminRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async findUserById(
    userId: string
  ): Promise<{ id: string; email: string; role: AccountRole; status: AccountStatus; createdAt: Date } | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      role: row.role as AccountRole,
      status: row.status as AccountStatus,
      createdAt: row.createdAt
    };
  }

  public async listAccounts(query: ListAccountsQuery): Promise<AdminAccountSummary[]> {
    const conditions = [];

    if (query.status) {
      conditions.push(eq(users.status, query.status));
    }
    if (query.role) {
      conditions.push(eq(users.role, query.role));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);

    const accounts: AdminAccountSummary[] = [];

    for (const u of userRows) {
      const summary = await this.getAccountSummary(u.id);
      if (summary) {
        accounts.push(summary);
      }
    }

    return accounts;
  }

  public async approveAccount(
    userId: string,
    adminUserId: string
  ): Promise<AdminAccountSummary | null> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .update(users)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      if (!user) {
        return null;
      }

      const now = new Date();
      if (user.role === 'hospital') {
        await tx
          .update(hospitals)
          .set({ verifiedAt: now, verifiedBy: adminUserId, updatedAt: now })
          .where(eq(hospitals.userId, userId));
      } else if (user.role === 'blood_bank') {
        await tx
          .update(bloodBanks)
          .set({ verifiedAt: now, updatedAt: now })
          .where(eq(bloodBanks.userId, userId));
      }

      return this.getAccountSummary(userId);
    });
  }

  public async suspendAccount(userId: string): Promise<AdminAccountSummary | null> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .update(users)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      if (!user) {
        return null;
      }

      // Revoke all refresh tokens for this user on suspension
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, userId));

      return this.getAccountSummary(userId);
    });
  }

  public async reactivateAccount(userId: string): Promise<AdminAccountSummary | null> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .update(users)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      if (!user) {
        return null;
      }

      return this.getAccountSummary(userId);
    });
  }

  private async getAccountSummary(userId: string): Promise<AdminAccountSummary | null> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return null;
    }

    let details: AdminAccountSummary['details'] = null;

    if (user.role === 'hospital') {
      const [hosp] = await this.db
        .select({
          name: hospitals.name,
          registrationNo: hospitals.registrationNo,
          phone: hospitals.phone,
          address: hospitals.address,
          verifiedAt: hospitals.verifiedAt,
          verifiedBy: hospitals.verifiedBy
        })
        .from(hospitals)
        .where(eq(hospitals.userId, userId))
        .limit(1);

      if (hosp) {
        details = {
          name: hosp.name,
          registrationNo: hosp.registrationNo,
          phone: hosp.phone,
          address: hosp.address,
          isVerified: Boolean(hosp.verifiedAt),
          verifiedAt: hosp.verifiedAt ? hosp.verifiedAt.toISOString() : null,
          verifiedBy: hosp.verifiedBy
        };
      }
    } else if (user.role === 'blood_bank') {
      const [bb] = await this.db
        .select({
          name: bloodBanks.name,
          licenseNo: bloodBanks.licenseNo,
          phone: bloodBanks.phone,
          address: bloodBanks.address,
          verifiedAt: bloodBanks.verifiedAt
        })
        .from(bloodBanks)
        .where(eq(bloodBanks.userId, userId))
        .limit(1);

      if (bb) {
        details = {
          name: bb.name,
          licenseNo: bb.licenseNo,
          phone: bb.phone,
          address: bb.address,
          isVerified: Boolean(bb.verifiedAt),
          verifiedAt: bb.verifiedAt ? bb.verifiedAt.toISOString() : null
        };
      }
    } else if (user.role === 'donor') {
      const [d] = await this.db
        .select({
          fullName: donors.fullName,
          bloodGroup: donors.bloodGroup,
          isAvailable: donors.isAvailable,
          eligibleAfter: donors.eligibleAfter,
          lastDonationDate: donors.lastDonationDate
        })
        .from(donors)
        .where(eq(donors.userId, userId))
        .limit(1);

      if (d) {
        details = {
          fullName: d.fullName,
          bloodGroup: d.bloodGroup,
          isAvailable: d.isAvailable,
          eligibleAfter: d.eligibleAfter,
          lastDonationDate: d.lastDonationDate
        };
      }
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as AccountRole,
      status: user.status as AccountStatus,
      createdAt:
        user.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : user.createdAt
            ? new Date(user.createdAt as string).toISOString()
            : new Date().toISOString(),
      details
    };
  }

  public async listAuditLogs(query: ListAuditLogsQuery): Promise<{ items: AuditLogItem[]; total: number }> {
    const conditions = [];
    if (query.entity) conditions.push(eq(auditLogs.entity, query.entity));
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.actorUserId) conditions.push(eq(auditLogs.actorUserId, query.actorUserId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(auditLogs)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    const rows = await this.db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        ipHash: auditLogs.ipHash,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt
      })
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.limit ?? 20)
      .offset(query.offset ?? 0);

    const items = rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      ipHash: r.ipHash,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString()
    }));

    return { items, total };
  }
}
