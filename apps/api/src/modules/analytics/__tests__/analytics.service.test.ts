import { describe, it, expect, vi } from 'vitest';
import { AnalyticsService } from '../analytics.service.js';
import type { AnalyticsOverview, IAnalyticsRepository } from '../analytics.types.js';

describe('AnalyticsService Unit Tests', () => {
  it('delegates to repository and returns analytics overview', async () => {
    const expectedOverview: AnalyticsOverview = {
      requestsByStatus: {
        open: 2,
        matching: 3,
        fulfilled: 10,
        cancelled: 1,
        expired: 1,
        total: 17
      },
      fulfillmentRate: 0.5882,
      responseRate: 0.725,
      medianTimeToFirstAcceptSeconds: 315.5,
      radiusExpansionFrequency: 0.25,
      degradedRunRate: 0.1,
      totalMatchRuns: 20,
      totalNotifications: 80,
      timestamp: '2026-10-14T12:00:00.000Z'
    };

    const mockRepo: IAnalyticsRepository = {
      getOverviewMetrics: vi.fn().mockResolvedValue(expectedOverview)
    };

    const service = new AnalyticsService(mockRepo);
    const result = await service.getOverview({
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-14T00:00:00.000Z')
    });

    expect(result).toEqual(expectedOverview);
    expect(mockRepo.getOverviewMetrics).toHaveBeenCalledWith({
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-14T00:00:00.000Z')
    });
  });
});
