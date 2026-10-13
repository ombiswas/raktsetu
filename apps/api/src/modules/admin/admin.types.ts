export type AccountStatus = 'pending' | 'active' | 'suspended';
export type AccountRole = 'donor' | 'hospital' | 'blood_bank' | 'admin';

export interface AdminHospitalDetails {
  name: string;
  registrationNo: string;
  phone: string;
  address: string;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export interface AdminBloodBankDetails {
  name: string;
  licenseNo: string;
  phone: string;
  address: string;
  isVerified: boolean;
  verifiedAt: string | null;
}

export interface AdminDonorDetails {
  fullName: string;
  bloodGroup: string;
  isAvailable: boolean;
  eligibleAfter: string | null;
  lastDonationDate: string | null;
}

export interface AdminAccountSummary {
  id: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
  details?: AdminHospitalDetails | AdminBloodBankDetails | AdminDonorDetails | null;
}

export interface ListAccountsQuery {
  status?: AccountStatus | undefined;
  role?: AccountRole | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface IAdminRepository {
  findUserById(
    userId: string
  ): Promise<{ id: string; email: string; role: AccountRole; status: AccountStatus; createdAt: Date } | null>;
  listAccounts(query: ListAccountsQuery): Promise<AdminAccountSummary[]>;
  approveAccount(userId: string, adminUserId: string): Promise<AdminAccountSummary | null>;
  suspendAccount(userId: string): Promise<AdminAccountSummary | null>;
  reactivateAccount(userId: string): Promise<AdminAccountSummary | null>;
}
