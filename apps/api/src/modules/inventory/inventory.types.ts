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

export interface InventoryOverview {
  bloodBankId: string;
  items: InventoryItem[];
  totalUnits: number;
  lowStockCount: number;
}

export interface AdjustStockInput {
  bloodBankId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  delta: number;
  reason: string;
  requestId?: string | undefined;
  actorUserId?: string | undefined;
  ip?: string | undefined;
}

export interface AdjustStockResult {
  inventoryId: string;
  bloodBankId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  previousUnits: number;
  newUnits: number;
  delta: number;
  reason: string;
  requestId: string | null;
  movementId: string;
  isLowStock: boolean;
  lowStockThreshold: number;
  createdAt: string;
}

export interface IInventoryRepository {
  findInventoryByBank(bankId: string): Promise<
    Array<{
      id: string;
      bloodBankId: string;
      bloodGroup: BloodGroup;
      component: BloodComponent;
      units: number;
      updatedAt: Date;
    }>
  >;

  adjustStockTransaction(params: {
    bloodBankId: string;
    bloodGroup: BloodGroup;
    component: BloodComponent;
    delta: number;
    reason: string;
    requestId?: string | null | undefined;
  }): Promise<{
    inventoryId: string;
    bloodBankId: string;
    bloodGroup: BloodGroup;
    component: BloodComponent;
    previousUnits: number;
    newUnits: number;
    delta: number;
    reason: string;
    requestId: string | null;
    movementId: string;
    createdAt: Date;
  }>;
}
