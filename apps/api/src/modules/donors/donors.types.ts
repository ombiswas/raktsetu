import type { BloodGroup } from '../matching/domain/blood-compatibility.js';

export interface DonorProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  bloodGroup: BloodGroup;
  dateOfBirth: string;
  weightKg: number;
  sex: 'male' | 'female' | 'other';
  isAvailable: boolean;
  availableFrom: string | null;
  eligibleAfter: string | null;
  lastDonationDate: string | null;
  hasLocation: boolean;
  locationUpdatedAt: string | null;
  consentLocationAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateDonorProfileInput {
  fullName?: string | undefined;
  phone?: string | undefined;
  weightKg?: number | undefined;
  isAvailable?: boolean | undefined;
  availableFrom?: string | null | undefined;
}

export interface UpdateDonorLocationInput {
  latitude: number;
  longitude: number;
  consentGiven: boolean;
}

export interface DonorDonationRecord {
  id: string;
  bloodBankId: string;
  bloodBankName: string;
  requestId: string | null;
  donatedAt: string;
  units: number;
}

export interface IDonorsRepository {
  findProfileByUserId(userId: string): Promise<DonorProfile | null>;
  updateProfile(userId: string, data: UpdateDonorProfileInput): Promise<DonorProfile | null>;
  updateLocation(
    userId: string,
    data: { latitude: number; longitude: number; consentedAt: Date }
  ): Promise<{ locationUpdatedAt: Date } | null>;
  getDonationHistory(userId: string): Promise<DonorDonationRecord[]>;
}
