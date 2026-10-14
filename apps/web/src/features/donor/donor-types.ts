export interface DonorProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  bloodGroup: string;
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

export interface DonationHistoryItem {
  id: string;
  bloodBankId: string;
  bloodBankName: string;
  requestId: string | null;
  donatedAt: string;
  units: number;
}

export interface InAppNotification {
  id: string;
  userId: string;
  kind: string;
  payload: {
    requestId?: string;
    bloodGroup?: string;
    urgency?: 'critical' | 'urgent' | 'standard';
    units?: number;
    respondUrl?: string;
    approximateDistanceKm?: number;
    issuedAt?: string;
    [key: string]: unknown;
  };
  readAt: string | null;
  createdAt: string;
}

export interface BloodRequestDetails {
  id: string;
  hospitalId: string;
  hospitalName: string;
  hospitalAddress: string;
  bloodGroup: string;
  component: string;
  unitsRequired: number;
  unitsFulfilled: number;
  urgency: 'critical' | 'urgent' | 'standard';
  status: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  neededBy: string;
  createdAt: string;
  updatedAt: string;
}
