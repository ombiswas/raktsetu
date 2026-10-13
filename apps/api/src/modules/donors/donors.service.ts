import { NotFoundError, ValidationError } from '../../platform/http/errors.js';
import type { AuditService } from '../audit/audit.service.js';
import type {
  IDonorsRepository,
  DonorProfile,
  UpdateDonorProfileInput,
  UpdateDonorLocationInput,
  DonorDonationRecord
} from './donors.types.js';

export class DonorsService {
  constructor(
    private readonly repository: IDonorsRepository,
    private readonly audit?: AuditService
  ) {}

  public async getProfile(userId: string): Promise<DonorProfile> {
    const profile = await this.repository.findProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundError('Donor profile not found');
    }
    return profile;
  }

  public async updateProfile(
    userId: string,
    input: UpdateDonorProfileInput,
    ip?: string
  ): Promise<DonorProfile> {
    if (input.weightKg !== undefined && (input.weightKg < 45 || isNaN(input.weightKg))) {
      throw new ValidationError('Donor weight must be at least 45 kg');
    }

    const updated = await this.repository.updateProfile(userId, input);
    if (!updated) {
      throw new NotFoundError('Donor profile not found');
    }

    if (this.audit) {
      await this.audit.record({
        action: 'donor.profile.update',
        entity: 'donor',
        entityId: userId,
        actorUserId: userId,
        ip,
        metadata: {
          updatedFields: Object.keys(input)
        }
      });
    }

    return updated;
  }

  public async updateLocation(
    userId: string,
    input: UpdateDonorLocationInput,
    ip?: string
  ): Promise<{ message: string; locationUpdatedAt: string }> {
    if (!input.consentGiven) {
      throw new ValidationError('Explicit consent is strictly required to store location');
    }

    if (
      isNaN(input.latitude) ||
      isNaN(input.longitude) ||
      input.latitude < -90 ||
      input.latitude > 90 ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new ValidationError('Coordinates are outside valid geospatial ranges');
    }

    const consentedAt = new Date();
    const result = await this.repository.updateLocation(userId, {
      latitude: input.latitude,
      longitude: input.longitude,
      consentedAt
    });

    if (!result) {
      throw new NotFoundError('Donor profile not found');
    }

    if (this.audit) {
      // PRIVACY SAFEGUARD: Never log raw coordinates to audit logs
      await this.audit.record({
        action: 'donor.location.update',
        entity: 'donor',
        entityId: userId,
        actorUserId: userId,
        ip,
        metadata: {
          consentGiven: true
        }
      });
    }

    return {
      message: 'Geospatial coordinates updated with explicit consent',
      locationUpdatedAt: result.locationUpdatedAt.toISOString()
    };
  }

  public async getDonationHistory(userId: string): Promise<{ donations: DonorDonationRecord[] }> {
    // Verify donor exists
    const profile = await this.repository.findProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundError('Donor profile not found');
    }

    const donations = await this.repository.getDonationHistory(userId);
    return { donations };
  }
}
