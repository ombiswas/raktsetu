import type { BloodComponent, BloodGroup } from '../inventory/inventory.types.js';

export type { BloodComponent, BloodGroup };

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  units: number;
}

export interface ForecastPoint {
  step: number;
  date: string;
  predictedUnits: number;
}

export interface DemandForecastRequest {
  series: TimeSeriesPoint[];
  horizon: number;
  bloodGroup?: BloodGroup | undefined;
  component?: BloodComponent | undefined;
}

export interface DemandForecastResult {
  forecast: ForecastPoint[];
  modelVersion: string;
  horizon: number;
}

export interface IForecastingMlClient {
  forecastDemand(req: DemandForecastRequest): Promise<DemandForecastResult | null>;
}

export interface StoredForecastRow {
  id: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  horizonStart: Date;
  horizonEnd: Date;
  predictedUnits: number;
  modelVersion: string;
  createdAt: Date;
}

export interface ForecastOverviewResponse {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  modelVersion: string;
  mae?: number | null | undefined;
  series: TimeSeriesPoint[];
  forecast: Array<{
    step: number;
    date: string;
    predictedUnits: number;
  }>;
  isSimulation: boolean;
}

export interface IForecastingRepository {
  getDailyAggregatedDemand(options: {
    startDate: string;
    endDate: string;
    bloodGroup?: BloodGroup | undefined;
    component?: BloodComponent | undefined;
  }): Promise<
    Array<{
      date: string;
      bloodGroup: BloodGroup;
      component: BloodComponent;
      units: number;
    }>
  >;

  upsertDemandForecasts(
    forecasts: Array<{
      bloodGroup: BloodGroup;
      component: BloodComponent;
      horizonStart: Date;
      horizonEnd: Date;
      predictedUnits: number;
      modelVersion: string;
    }>
  ): Promise<number>;

  getLatestForecasts(options: {
    bloodGroup: BloodGroup;
    component: BloodComponent;
    fromDate?: Date | undefined;
  }): Promise<StoredForecastRow[]>;
}
