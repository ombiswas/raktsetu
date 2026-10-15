export interface RequestsByStatus {
  open: number;
  matching: number;
  fulfilled: number;
  cancelled: number;
  expired: number;
  total: number;
}

export interface AnalyticsOverviewData {
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
