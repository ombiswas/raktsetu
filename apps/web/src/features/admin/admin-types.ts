export type AccountStatus = 'pending' | 'active' | 'suspended';
export type AccountRole = 'donor' | 'hospital' | 'blood_bank' | 'admin';

export interface AdminAccountSummary {
  id: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
  details?: {
    name?: string;
    fullName?: string;
    registrationNo?: string;
    licenseNo?: string;
    phone?: string;
    address?: string;
    isVerified?: boolean;
    verifiedAt?: string | null;
    verifiedBy?: string | null;
    bloodGroup?: string;
  } | null;
}

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string;
  ipHash: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
}
