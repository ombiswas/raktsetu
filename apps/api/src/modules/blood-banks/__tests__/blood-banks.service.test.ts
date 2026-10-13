import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BloodBanksService } from '../blood-banks.service.js';
import type { IBloodBanksRepository, BloodBankProfile } from '../blood-banks.types.js';
import { NotFoundError, ValidationError } from '../../../platform/http/errors.js';
import type { AuditService } from '../../audit/audit.service.js';

describe('BloodBanksService Unit Tests', () => {
  let repository: IBloodBanksRepository;
  let audit: AuditService;
  let service: BloodBanksService;

  const mockBankProfile: BloodBankProfile = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'redcross@example.com',
    name: 'Red Cross Regional Blood Center',
    licenseNo: 'BB-LIC-2026-001',
    phone: '+911144332211',
    address: '1 Red Cross Road, New Delhi',
    isVerified: true,
    verifiedAt: '2026-01-10T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z'
  };

  const mockDonor = {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    bloodGroup: 'O+' as const,
    isAvailable: true,
    eligibleAfter: null,
    lastDonationDate: '2025-10-01'
  };

  beforeEach(() => {
    repository = {
      findProfileByUserId: vi.fn(),
      updateProfile: vi.fn(),
      findDonorById: vi.fn(),
      recordDonationTransaction: vi.fn(),
      deferDonor: vi.fn()
    };
    audit = {
      record: vi.fn()
    } as unknown as AuditService;
    service = new BloodBanksService(repository, audit);
  });

  describe('getProfile', () => {
    it('returns blood bank profile', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);

      const res = await service.getProfile(mockBankProfile.id);
      expect(res).toEqual(mockBankProfile);
    });

    it('throws NotFoundError when profile is missing', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(null);

      await expect(service.getProfile('missing-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('recordDonation', () => {
    it('successfully records donation and credits inventory', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);
      vi.mocked(repository.findDonorById).mockResolvedValue(mockDonor);
      vi.mocked(repository.recordDonationTransaction).mockResolvedValue({
        donationId: 'don-1234',
        donorId: mockDonor.id,
        bloodBankId: mockBankProfile.id,
        bloodGroup: 'O+',
        component: 'whole_blood',
        units: 1,
        donatedAt: '2026-03-01T10:00:00.000Z',
        inventoryTotalUnits: 15
      });

      const result = await service.recordDonation(mockBankProfile.id, {
        donorId: mockDonor.id,
        bloodGroup: 'O+',
        component: 'whole_blood',
        units: 1
      });

      expect(result.donation.donationId).toBe('don-1234');
      expect(result.donation.inventoryTotalUnits).toBe(15);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'blood_bank.donation.recorded',
          entityId: 'don-1234'
        })
      );
    });

    it('rejects donation when blood group mismatches donor registered group', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);
      vi.mocked(repository.findDonorById).mockResolvedValue(mockDonor); // registered as O+

      await expect(
        service.recordDonation(mockBankProfile.id, {
          donorId: mockDonor.id,
          bloodGroup: 'A+', // Mismatched!
          component: 'whole_blood',
          units: 1
        })
      ).rejects.toThrow(/does not match donor profile/i);

      expect(repository.recordDonationTransaction).not.toHaveBeenCalled();
    });

    it('rejects donation when donor is currently deferred', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);
      vi.mocked(repository.findDonorById).mockResolvedValue({
        ...mockDonor,
        eligibleAfter: '2099-01-01' // Deferred until future
      });

      await expect(
        service.recordDonation(mockBankProfile.id, {
          donorId: mockDonor.id,
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 1
        })
      ).rejects.toThrow(/deferred from donation/i);

      expect(repository.recordDonationTransaction).not.toHaveBeenCalled();
    });

    it('rejects invalid units (< 1)', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);
      vi.mocked(repository.findDonorById).mockResolvedValue(mockDonor);

      await expect(
        service.recordDonation(mockBankProfile.id, {
          donorId: mockDonor.id,
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 0
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deferDonor', () => {
    it('successfully defers donor and records audit log', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);
      vi.mocked(repository.findDonorById).mockResolvedValue(mockDonor);
      vi.mocked(repository.deferDonor).mockResolvedValue({
        donorId: mockDonor.id,
        bloodGroup: 'O+',
        eligibleAfter: '2026-12-31',
        deferredAt: '2026-03-01T10:00:00.000Z',
        reason: 'Temporary medication deferral'
      });

      const res = await service.deferDonor(mockBankProfile.id, mockDonor.id, {
        eligibleAfter: '2026-12-31',
        reason: 'Temporary medication deferral'
      });

      expect(res.deferral.eligibleAfter).toBe('2026-12-31');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'blood_bank.donor.deferred',
          entityId: mockDonor.id
        })
      );
    });

    it('rejects deferral date that is in the past or today', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);
      vi.mocked(repository.findDonorById).mockResolvedValue(mockDonor);

      await expect(
        service.deferDonor(mockBankProfile.id, mockDonor.id, {
          eligibleAfter: '2020-01-01', // in past
          reason: 'Past date deferral'
        })
      ).rejects.toThrow(/strictly in the future/i);

      expect(repository.deferDonor).not.toHaveBeenCalled();
    });

    it('throws NotFoundError if donor does not exist', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockBankProfile);
      vi.mocked(repository.findDonorById).mockResolvedValue(null);

      await expect(
        service.deferDonor(mockBankProfile.id, 'missing-donor', {
          eligibleAfter: '2026-12-31',
          reason: 'Any reason'
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
