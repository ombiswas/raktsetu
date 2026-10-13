import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DonorsService } from '../donors.service.js';
import type { IDonorsRepository, DonorProfile } from '../donors.types.js';
import { NotFoundError, ValidationError } from '../../../platform/http/errors.js';
import type { AuditService } from '../../audit/audit.service.js';

describe('DonorsService Unit Tests', () => {
  let repository: IDonorsRepository;
  let audit: AuditService;
  let service: DonorsService;

  const mockProfile: DonorProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'donor@example.com',
    fullName: 'Jane Donor',
    phone: '+919876543210',
    bloodGroup: 'O+',
    dateOfBirth: '1995-05-15',
    weightKg: 62.5,
    sex: 'female',
    isAvailable: true,
    availableFrom: null,
    eligibleAfter: null,
    lastDonationDate: '2026-01-10',
    hasLocation: true,
    locationUpdatedAt: '2026-02-01T10:00:00.000Z',
    consentLocationAt: '2026-02-01T10:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z'
  };

  beforeEach(() => {
    repository = {
      findProfileByUserId: vi.fn(),
      updateProfile: vi.fn(),
      updateLocation: vi.fn(),
      getDonationHistory: vi.fn()
    };
    audit = {
      record: vi.fn()
    } as unknown as AuditService;
    service = new DonorsService(repository, audit);
  });

  describe('getProfile', () => {
    it('returns donor profile when found', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockProfile);

      const result = await service.getProfile(mockProfile.id);
      expect(result).toEqual(mockProfile);
      expect(repository.findProfileByUserId).toHaveBeenCalledWith(mockProfile.id);
    });

    it('throws NotFoundError when profile is missing', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('updates profile and records audit entry', async () => {
      const updatedProfile = { ...mockProfile, fullName: 'Jane Updated', weightKg: 64 };
      vi.mocked(repository.updateProfile).mockResolvedValue(updatedProfile);

      const result = await service.updateProfile(
        mockProfile.id,
        { fullName: 'Jane Updated', weightKg: 64 },
        '127.0.0.1'
      );

      expect(result.fullName).toBe('Jane Updated');
      expect(result.weightKg).toBe(64);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'donor.profile.update',
          entityId: mockProfile.id
        })
      );
    });

    it('rejects weight below 45kg with ValidationError', async () => {
      await expect(
        service.updateProfile(mockProfile.id, { weightKg: 44.9 })
      ).rejects.toThrow(ValidationError);
      expect(repository.updateProfile).not.toHaveBeenCalled();
    });

    it('rejects NaN weight with ValidationError', async () => {
      await expect(
        service.updateProfile(mockProfile.id, { weightKg: NaN })
      ).rejects.toThrow(ValidationError);
      expect(repository.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('updateLocation', () => {
    it('updates location with consent and never logs coordinates to audit logs', async () => {
      const now = new Date('2026-03-01T12:00:00.000Z');
      vi.mocked(repository.updateLocation).mockResolvedValue({ locationUpdatedAt: now });

      const res = await service.updateLocation(
        mockProfile.id,
        { latitude: 28.6139, longitude: 77.209, consentGiven: true },
        '127.0.0.1'
      );

      expect(res.locationUpdatedAt).toBe(now.toISOString());
      expect(repository.updateLocation).toHaveBeenCalledWith(
        mockProfile.id,
        expect.objectContaining({
          latitude: 28.6139,
          longitude: 77.209
        })
      );

      // Verify privacy guarantee: coordinates NEVER stored in audit metadata
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'donor.location.update',
          metadata: { consentGiven: true }
        })
      );
      const auditCall = vi.mocked(audit.record).mock.calls[0]?.[0];
      expect(auditCall?.metadata).not.toHaveProperty('latitude');
      expect(auditCall?.metadata).not.toHaveProperty('longitude');
    });

    it('rejects update without consent', async () => {
      await expect(
        service.updateLocation(mockProfile.id, {
          latitude: 28.6139,
          longitude: 77.209,
          consentGiven: false as unknown as true
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects latitude > 90', async () => {
      await expect(
        service.updateLocation(mockProfile.id, {
          latitude: 90.001,
          longitude: 77.209,
          consentGiven: true
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects longitude > 180', async () => {
      await expect(
        service.updateLocation(mockProfile.id, {
          latitude: 28.6139,
          longitude: 180.5,
          consentGiven: true
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getDonationHistory', () => {
    it('returns donations history for valid donor', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockProfile);
      const mockHistory = [
        {
          id: '22222222-2222-2222-2222-222222222222',
          bloodBankId: '33333333-3333-3333-3333-333333333333',
          bloodBankName: 'City Central Blood Bank',
          requestId: null,
          donatedAt: '2026-01-10T09:30:00.000Z',
          units: 1
        }
      ];
      vi.mocked(repository.getDonationHistory).mockResolvedValue(mockHistory);

      const result = await service.getDonationHistory(mockProfile.id);
      expect(result.donations).toHaveLength(1);
      expect(result.donations[0]?.bloodBankName).toBe('City Central Blood Bank');
    });
  });
});
