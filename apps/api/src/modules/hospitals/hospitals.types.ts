export interface HospitalProfile {
  id: string;
  email: string;
  name: string;
  registrationNo: string;
  phone: string;
  address: string;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateHospitalProfileInput {
  phone?: string | undefined;
  address?: string | undefined;
}

export interface IHospitalsRepository {
  findProfileByUserId(userId: string): Promise<HospitalProfile | null>;
  updateProfile(userId: string, data: UpdateHospitalProfileInput): Promise<HospitalProfile | null>;
}
