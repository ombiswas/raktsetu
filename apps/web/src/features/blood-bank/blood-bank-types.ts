/**
 * Domain & DTO types for Blood Bank Inventory & Donor Clinical Workflows.
 * Follows strict deterministic research boundaries and zero-PII donor lookups.
 */

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type BloodComponent = 'whole_blood' | 'rbc' | 'plasma' | 'platelets';

export interface InventoryItem {
  id: string;
  bloodBankId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  isLowStock: boolean;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface InventoryData {
  bloodBankId: string;
  items: InventoryItem[];
  totalUnits: number;
  lowStockCount: number;
}

export interface SafeDonorSummary {
  id: string;
  bloodGroup: BloodGroup;
  isAvailable: boolean;
  eligibleAfter: string | null;
  lastDonationDate: string | null;
}

export interface AdjustStockInput {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  delta: number;
  reason: string;
  requestId?: string | undefined;
}

export interface RecordDonationInput {
  donorId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  requestId?: string | null | undefined;
  donatedAt?: string | undefined;
}

export interface DeferDonorInput {
  eligibleAfter: string;
  reason: string;
}
