import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from '../admin.service.js';
import type { IAdminRepository, AdminAccountSummary } from '../admin.types.js';
import { NotFoundError } from '../../../platform/http/errors.js';
import type { AuditService } from '../../audit/audit.service.js';

describe('AdminService Unit Tests', () => {
  let repository: IAdminRepository;
  let audit: AuditService;
  let service: AdminService;

  const mockPendingHospital: AdminAccountSummary = {
    id: 'hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh',
    email: 'new.hospital@example.com',
    role: 'hospital',
    status: 'pending',
    createdAt: '2026-03-01T00:00:00.000Z',
    details: {
      name: 'City Trauma Care',
      registrationNo: 'REG-12345',
      phone: '+919988112233',
      address: 'Ring Road, Delhi',
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null
    }
  };

  const adminUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(() => {
    repository = {
      findUserById: vi.fn(),
      listAccounts: vi.fn(),
      approveAccount: vi.fn(),
      suspendAccount: vi.fn(),
      reactivateAccount: vi.fn(),
      listAuditLogs: vi.fn()
    };
    audit = {
      record: vi.fn()
    } as unknown as AuditService;
    service = new AdminService(repository, audit);
  });

  describe('listAccounts', () => {
    it('returns filtered list of accounts', async () => {
      vi.mocked(repository.listAccounts).mockResolvedValue([mockPendingHospital]);

      const res = await service.listAccounts({ status: 'pending' });
      expect(res.accounts).toHaveLength(1);
      expect(res.accounts[0]?.email).toBe('new.hospital@example.com');
      expect(repository.listAccounts).toHaveBeenCalledWith({ status: 'pending' });
    });
  });

  describe('approveAccount', () => {
    it('approves pending account and records audit event', async () => {
      vi.mocked(repository.findUserById).mockResolvedValue({
        id: mockPendingHospital.id,
        email: mockPendingHospital.email,
        role: 'hospital',
        status: 'pending',
        createdAt: new Date('2026-03-01')
      });
      const approvedHospital = {
        ...mockPendingHospital,
        status: 'active' as const,
        details: {
          ...mockPendingHospital.details!,
          isVerified: true,
          verifiedAt: '2026-03-01T12:00:00.000Z',
          verifiedBy: adminUserId
        }
      };
      vi.mocked(repository.approveAccount).mockResolvedValue(approvedHospital);

      const res = await service.approveAccount(mockPendingHospital.id, adminUserId, '127.0.0.1');
      expect(res.account.status).toBe('active');
      expect(repository.approveAccount).toHaveBeenCalledWith(mockPendingHospital.id, adminUserId);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.account.approve',
          entityId: mockPendingHospital.id,
          actorUserId: adminUserId
        })
      );
    });

    it('throws NotFoundError if account does not exist', async () => {
      vi.mocked(repository.findUserById).mockResolvedValue(null);

      await expect(service.approveAccount('missing-id', adminUserId)).rejects.toThrow(NotFoundError);
      expect(repository.approveAccount).not.toHaveBeenCalled();
    });
  });

  describe('suspendAccount', () => {
    it('suspends account and records audit event', async () => {
      vi.mocked(repository.findUserById).mockResolvedValue({
        id: mockPendingHospital.id,
        email: mockPendingHospital.email,
        role: 'hospital',
        status: 'active',
        createdAt: new Date('2026-03-01')
      });
      const suspended = { ...mockPendingHospital, status: 'suspended' as const };
      vi.mocked(repository.suspendAccount).mockResolvedValue(suspended);

      const res = await service.suspendAccount(mockPendingHospital.id, adminUserId, '127.0.0.1');
      expect(res.account.status).toBe('suspended');
      expect(repository.suspendAccount).toHaveBeenCalledWith(mockPendingHospital.id);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.account.suspend',
          entityId: mockPendingHospital.id,
          actorUserId: adminUserId
        })
      );
    });

    it('throws NotFoundError when account not found for suspension', async () => {
      vi.mocked(repository.findUserById).mockResolvedValue(null);

      await expect(service.suspendAccount('missing-id', adminUserId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('reactivateAccount', () => {
    it('reactivates suspended account', async () => {
      vi.mocked(repository.findUserById).mockResolvedValue({
        id: mockPendingHospital.id,
        email: mockPendingHospital.email,
        role: 'hospital',
        status: 'suspended',
        createdAt: new Date('2026-03-01')
      });
      const reactivated = { ...mockPendingHospital, status: 'active' as const };
      vi.mocked(repository.reactivateAccount).mockResolvedValue(reactivated);

      const res = await service.reactivateAccount(mockPendingHospital.id, adminUserId, '127.0.0.1');
      expect(res.account.status).toBe('active');
      expect(repository.reactivateAccount).toHaveBeenCalledWith(mockPendingHospital.id);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.account.reactivate',
          entityId: mockPendingHospital.id
        })
      );
    });
  });
});
