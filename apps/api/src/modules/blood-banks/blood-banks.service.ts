import { NotFoundError, ValidationError } from '../../platform/http/errors.js';
import type { AuditService } from '../audit/audit.service.js';
import type {
  IBloodBanksRepository,
  BloodBankProfile,
  UpdateBloodBankProfileInput,
  RecordDonationInput,
  RecordDonationResult,
  DeferDonorInput,
  DeferDonorResult
} from './blood-banks.types.js';

export class BloodBanksService {
  constructor(
    private readonly repository: IBloodBanksRepository,
    private readonly audit?: AuditService
  ) {}

  public async getProfile(userId: string): Promise<BloodBankProfile> {
    const profile = await this.repository.findProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundError('Blood bank profile not found');
    }
    return profile;
  }

  public async updateProfile(
    userId: string,
    input: UpdateBloodBankProfileInput,
    ip?: string
  ): Promise<BloodBankProfile> {
    const updated = await this.repository.updateProfile(userId, input);
    if (!updated) {
      throw new NotFoundError('Blood bank profile not found');
    }

    if (this.audit) {
      await this.audit.record({
        action: 'blood_bank.profile.update',
        entity: 'blood_bank',
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

  public async recordDonation(
    bloodBankId: string,
    input: RecordDonationInput,
    ip?: string
  ): Promise<{ message: string; donation: RecordDonationResult }> {
    // 1. Verify blood bank exists
    const bank = await this.repository.findProfileByUserId(bloodBankId);
    if (!bank) {
      throw new NotFoundError('Blood bank profile not found');
    }

    // 2. Verify donor exists
    const donor = await this.repository.findDonorById(input.donorId);
    if (!donor) {
      throw new NotFoundError('Donor profile not found');
    }

    // 3. Verify blood group match
    if (donor.bloodGroup !== input.bloodGroup) {
      throw new ValidationError(
        `Recorded blood group (${input.bloodGroup}) does not match donor profile (${donor.bloodGroup})`
      );
    }

    // 4. Verify donor is not currently deferred
    const todayStr = new Date().toISOString().slice(0, 10);
    if (donor.eligibleAfter && donor.eligibleAfter > todayStr) {
      throw new ValidationError(
        `Donor is currently deferred from donation until ${donor.eligibleAfter}`
      );
    }

    // 5. Units bounds check
    if (input.units < 1 || input.units > 10) {
      throw new ValidationError('Donation units must be between 1 and 10');
    }

    const donatedAt = input.donatedAt ? new Date(input.donatedAt) : new Date();

    // 6. Execute atomic transaction (donations record + donor cooldown + inventory upsert + movement record)
    const result = await this.repository.recordDonationTransaction({
      bloodBankId,
      donorId: input.donorId,
      bloodGroup: input.bloodGroup,
      component: input.component,
      units: input.units,
      requestId: input.requestId ?? null,
      donatedAt
    });

    // 7. Audit log
    if (this.audit) {
      await this.audit.record({
        action: 'blood_bank.donation.recorded',
        entity: 'donations',
        entityId: result.donationId,
        actorUserId: bloodBankId,
        ip,
        metadata: {
          donorId: result.donorId,
          bloodGroup: result.bloodGroup,
          component: result.component,
          units: result.units,
          inventoryTotalUnits: result.inventoryTotalUnits
        }
      });
    }

    return {
      message: 'Donation recorded and blood bank inventory credited successfully',
      donation: result
    };
  }

  public async deferDonor(
    bloodBankId: string,
    donorId: string,
    input: DeferDonorInput,
    ip?: string
  ): Promise<{ message: string; deferral: DeferDonorResult }> {
    // 1. Verify blood bank exists
    const bank = await this.repository.findProfileByUserId(bloodBankId);
    if (!bank) {
      throw new NotFoundError('Blood bank profile not found');
    }

    // 2. Verify donor exists
    const donor = await this.repository.findDonorById(donorId);
    if (!donor) {
      throw new NotFoundError('Donor profile not found');
    }

    // 3. Deferral date must be strictly in the future
    const todayStr = new Date().toISOString().slice(0, 10);
    if (input.eligibleAfter <= todayStr) {
      throw new ValidationError('Deferral eligible_after date must be strictly in the future');
    }

    const result = await this.repository.deferDonor({
      donorId,
      eligibleAfter: input.eligibleAfter,
      reason: input.reason,
      bloodBankUserId: bloodBankId
    });

    if (!result) {
      throw new NotFoundError('Failed to defer donor');
    }

    // 4. Audit entry
    if (this.audit) {
      await this.audit.record({
        action: 'blood_bank.donor.deferred',
        entity: 'donors',
        entityId: donorId,
        actorUserId: bloodBankId,
        ip,
        metadata: {
          eligibleAfter: input.eligibleAfter,
          reason: input.reason
        }
      });
    }

    return {
      message: 'Donor deferral recorded successfully',
      deferral: result
    };
  }
}
