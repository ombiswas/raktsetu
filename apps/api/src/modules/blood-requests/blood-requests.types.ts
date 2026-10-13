import type { GeoPoint } from '../../platform/database/schema.js';
import type { RequestStatus } from './domain/state-machine.js';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type BloodComponent = 'whole_blood' | 'rbc' | 'plasma' | 'platelets';
export type RequestUrgency = 'critical' | 'urgent' | 'standard';

export interface CreateBloodRequestInput {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  urgency: RequestUrgency;
  neededBy: string;
}

import type { BloodRequestFilter } from './blood-requests.schema.js';
export type { BloodRequestFilter };

export interface BloodRequestRecord {
  id: string;
  hospitalId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  unitsFulfilled: number;
  urgency: RequestUrgency;
  status: RequestStatus;
  neededBy: Date;
  location: GeoPoint;
  createdAt: Date;
  updatedAt: Date;
}

export interface HospitalBloodRequestView {
  id: string;
  hospitalId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  unitsFulfilled: number;
  urgency: RequestUrgency;
  status: RequestStatus;
  neededBy: string;
  location: GeoPoint;
  createdAt: string;
  updatedAt: string;
}

export interface ReadOnlyBloodRequestView {
  id: string;
  hospitalId: string;
  hospitalName: string;
  hospitalAddress: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  unitsFulfilled: number;
  urgency: RequestUrgency;
  status: RequestStatus;
  neededBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalProfileLookup {
  id: string;
  name: string;
  address: string;
  location: GeoPoint;
  verifiedAt: Date | null;
}

export interface IdempotencyRecord {
  key: string;
  userId: string;
  requestHash: string;
  responseCode: number;
  responseBody: unknown;
  expiresAt: Date;
}

export interface IBloodRequestsRepository {
  findHospitalById(hospitalId: string): Promise<HospitalProfileLookup | null>;
  createRequest(data: {
    hospitalId: string;
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: RequestUrgency;
    neededBy: Date;
    location: GeoPoint;
  }): Promise<BloodRequestRecord>;
  findRequestById(id: string): Promise<BloodRequestRecord | null>;
  findRequestWithHospitalDetails(
    id: string
  ): Promise<{ request: BloodRequestRecord; hospitalName: string; hospitalAddress: string } | null>;
  listRequestsByHospital(
    hospitalId: string,
    filter?: BloodRequestFilter
  ): Promise<BloodRequestRecord[]>;
  listAllRequests(
    filter?: BloodRequestFilter
  ): Promise<Array<{ request: BloodRequestRecord; hospitalName: string; hospitalAddress: string }>>;
  updateRequestStatus(id: string, newStatus: RequestStatus): Promise<BloodRequestRecord | null>;
  findAndExpireOverdueRequests(asOfDate: Date): Promise<BloodRequestRecord[]>;
  findIdempotencyKey(key: string, userId: string): Promise<IdempotencyRecord | null>;
  saveIdempotencyKey(record: {
    key: string;
    userId: string;
    requestHash: string;
    responseCode: number;
    responseBody: unknown;
    expiresAt: Date;
  }): Promise<void>;
}
