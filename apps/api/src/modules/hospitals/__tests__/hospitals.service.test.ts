import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HospitalsService } from '../hospitals.service.js';
import type { IHospitalsRepository, HospitalProfile } from '../hospitals.types.js';
import { NotFoundError } from '../../../platform/http/errors.js';
import type { AuditService } from '../../audit/audit.service.js';

describe('HospitalsService Unit Tests', () => {
  let repository: IHospitalsRepository;
  let audit: AuditService;
  let service: HospitalsService;

  const mockProfile: HospitalProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'apollo@example.com',
    name: 'Apollo Emergency Center',
    registrationNo: 'HOSP-DEL-2026-99',
    phone: '+911122334455',
    address: 'Sarita Vihar, Delhi Mathura Road, New Delhi',
    isVerified: true,
    verifiedAt: '2026-01-15T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z'
  };

  beforeEach(() => {
    repository = {
      findProfileByUserId: vi.fn(),
      updateProfile: vi.fn()
    };
    audit = {
      record: vi.fn()
    } as unknown as AuditService;
    service = new HospitalsService(repository, audit);
  });

  describe('getProfile', () => {
    it('returns hospital profile when found', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(mockProfile);

      const result = await service.getProfile(mockProfile.id);
      expect(result).toEqual(mockProfile);
      expect(repository.findProfileByUserId).toHaveBeenCalledWith(mockProfile.id);
    });

    it('throws NotFoundError when hospital profile is missing', async () => {
      vi.mocked(repository.findProfileByUserId).mockResolvedValue(null);

      await expect(service.getProfile('missing-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('updates profile and records audit entry', async () => {
      const updatedProfile = { ...mockProfile, phone: '+919988776655' };
      vi.mocked(repository.updateProfile).mockResolvedValue(updatedProfile);

      const result = await service.updateProfile(
        mockProfile.id,
        { phone: '+919988776655' },
        '127.0.0.1'
      );

      expect(result.phone).toBe('+919988776655');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'hospital.profile.update',
          entityId: mockProfile.id
        })
      );
    });

    it('throws NotFoundError when updating non-existent hospital', async () => {
      vi.mocked(repository.updateProfile).mockResolvedValue(null);

      await expect(
        service.updateProfile('missing-id', { phone: '+919988776655' })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
