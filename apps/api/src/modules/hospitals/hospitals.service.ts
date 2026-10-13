import { NotFoundError } from '../../platform/http/errors.js';
import type { AuditService } from '../audit/audit.service.js';
import type {
  IHospitalsRepository,
  HospitalProfile,
  UpdateHospitalProfileInput
} from './hospitals.types.js';

export class HospitalsService {
  constructor(
    private readonly repository: IHospitalsRepository,
    private readonly audit?: AuditService
  ) {}

  public async getProfile(userId: string): Promise<HospitalProfile> {
    const profile = await this.repository.findProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundError('Hospital profile not found');
    }
    return profile;
  }

  public async updateProfile(
    userId: string,
    input: UpdateHospitalProfileInput,
    ip?: string
  ): Promise<HospitalProfile> {
    const updated = await this.repository.updateProfile(userId, input);
    if (!updated) {
      throw new NotFoundError('Hospital profile not found');
    }

    if (this.audit) {
      await this.audit.record({
        action: 'hospital.profile.update',
        entity: 'hospital',
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
}
