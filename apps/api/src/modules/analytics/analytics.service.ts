import type {
  AnalyticsOverview,
  AnalyticsQueryOptions,
  IAnalyticsRepository
} from './analytics.types.js';

export class AnalyticsService {
  constructor(private readonly repository: IAnalyticsRepository) {}

  public async getOverview(options?: AnalyticsQueryOptions): Promise<AnalyticsOverview> {
    return this.repository.getOverviewMetrics(options);
  }
}
