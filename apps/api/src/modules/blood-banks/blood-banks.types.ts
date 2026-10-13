import type { BloodGroup } from '../matching/domain/blood-compatibility.js';

export type BloodComponentType = 'whole_blood' | 'rbc' | 'plasma' | 'platelets';

export interface BloodBankProfile {
  id: string;
  email: string;
  name: string;
  licenseNo: string;
  phone: string;
  address: string;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateBloodBankProfileInput {
  phone?: string | undefined;
  address?: string | undefined;
}

export interface RecordDonationInput {
  donorId: string;
  bloodGroup: BloodGroup;
  component: BloodComponentType;
  units: number;
  requestId?: string | null | undefined;
  donatedAt?: string | undefined;
}

export interface RecordDonationResult {
  donationId: string;
  donorId: string;
  bloodBankId: string;
  bloodGroup: BloodGroup;
  component: BloodComponentType;
  units: number;
  donatedAt: string;
  inventoryTotalUnits: number;
}

export interface DeferDonorInput {
  eligibleAfter: string; // YYYY-MM-DD
  reason: string;
}

export interface DeferDonorResult {
  donorId: string;
  bloodGroup: BloodGroup;
  eligibleAfter: string;
  deferredAt: string;
  reason: string;
}

export interface SafeDonorSummary {
  id: string;
  bloodGroup: BloodGroup;
  isAvailable: boolean;
  eligibleAfter: string | null;
  lastDonationDate: string | null;
}

export interface IBloodBanksRepository {
  findProfileByUserId(userId: string): Promise<BloodBankProfile | null>;
  updateProfile(userId: string, data: UpdateBloodBankProfileInput): Promise<BloodBankProfile | null>;
  findDonorById(donorId: string): Promise<SafeDonorSummary | null>;
  recordDonationTransaction(params: {
    bloodBankId: string;
    donorId: string;
    bloodGroup: BloodGroup;
    component: BloodComponentType;
    units: number;
    requestId?: string | null;
    donatedAt: Date;
  }): Promise<RecordDonationResult>;
  deferDonor(params: {
    donorId: string;
    eligibleAfter: string;
    reason: string;
    bloodBankUserId: string;
  }): Promise<DeferDonorResult | null>;
}
