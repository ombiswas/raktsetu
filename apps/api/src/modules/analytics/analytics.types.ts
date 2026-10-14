export interface RequestsByStatus {
  open: number;
  matching: number;
  fulfilled: number;
  cancelled: number;
  expired: number;
  total: number;
}

export interface AnalyticsOverview {
  requestsByStatus: RequestsByStatus;
  responseRate: number;
  medianTimeToFirstAcceptSeconds: number;
  fulfillmentRate: number;
  radiusExpansionFrequency: number;
  degradedRunRate: number;
  totalMatchRuns: number;
  totalNotifications: number;
  timestamp: string;
}

export interface AnalyticsQueryOptions {
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface IAnalyticsRepository {
  getOverviewMetrics(options?: AnalyticsQueryOptions): Promise<AnalyticsOverview>;
}
