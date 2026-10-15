import type { BloodGroup, BloodComponent } from '../blood-bank/blood-bank-types.js';

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  units: number;
}

export interface ForecastPoint {
  step: number;
  date: string;
  predictedUnits: number;
}

export interface ForecastOverviewData {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  modelVersion: string;
  mae?: number | null | undefined;
  series: TimeSeriesPoint[];
  forecast: ForecastPoint[];
  isSimulation: boolean;
}
