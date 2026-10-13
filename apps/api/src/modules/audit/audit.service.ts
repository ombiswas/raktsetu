import crypto from 'node:crypto';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import { auditLogs } from '../../platform/database/schema.js';
import type { Config } from '../../platform/config/index.js';

export interface AuditRecordParams {
  action: string;
  entity: string;
  entityId: string;
  actorUserId?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  ip?: string | null | undefined;
}

export class AuditService {
  private readonly pepper: string;

  constructor(
    private readonly db: DatabaseInstance,
    cfg: Config
  ) {
    // Derive a dedicated pepper for IP pseudonymization
    this.pepper = crypto
      .createHmac('sha256', cfg.COOKIE_SECRET)
      .update('raktsetu-audit-ip-pepper')
      .digest('hex');
  }

  /**
   * Hashes an IP address using HMAC-SHA256 with the server-side pepper.
   */
  public hashIp(ip: string): string {
    return crypto.createHmac('sha256', this.pepper).update(ip.trim()).digest('hex');
  }

  /**
   * Records an immutable audit log entry.
   * IP address is automatically hashed before database persistence.
   */
  public async record(params: AuditRecordParams): Promise<void> {
    try {
      const ipHash = params.ip ? this.hashIp(params.ip) : null;

      await this.db.insert(auditLogs).values({
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        ipHash,
        metadata: params.metadata ?? null
      });
    } catch (err) {
      // Audit logging errors should not crash main request workflows, but must be logged
      console.error('Failed to record audit log:', err);
    }
  }
}
