import { sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import type {
  AnalyticsOverview,
  AnalyticsQueryOptions,
  IAnalyticsRepository
} from './analytics.types.js';

export class AnalyticsRepository implements IAnalyticsRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async getOverviewMetrics(options?: AnalyticsQueryOptions): Promise<AnalyticsOverview> {
    const fromParam = options?.from ?? null;
    const toParam = options?.to ?? null;

    // 1. Requests by status & fulfillment rate
    const requestsQuery = sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::int AS "open",
        COUNT(*) FILTER (WHERE status = 'matching')::int AS "matching",
        COUNT(*) FILTER (WHERE status = 'fulfilled')::int AS "fulfilled",
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelled",
        COUNT(*) FILTER (WHERE status = 'expired')::int AS "expired",
        COUNT(*)::int AS "total",
        COALESCE(
          ROUND(
            (COUNT(*) FILTER (WHERE status = 'fulfilled')::numeric / NULLIF(COUNT(*), 0)::numeric),
            4
          )::float,
          0.0
        ) AS fulfillment_rate
      FROM blood_requests
      WHERE (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
        AND (${toParam}::timestamptz IS NULL OR created_at <= ${toParam}::timestamptz);
    `;

    // 2. Candidate response metrics
    const candidatesQuery = sql`
      SELECT
        COUNT(*) FILTER (WHERE notified_at IS NOT NULL)::int AS total_notifications,
        COALESCE(
          ROUND(
            (COUNT(*) FILTER (WHERE notified_at IS NOT NULL AND response IN ('accepted', 'declined'))::numeric /
             NULLIF(COUNT(*) FILTER (WHERE notified_at IS NOT NULL), 0)::numeric),
            4
          )::float,
          0.0
        ) AS response_rate
      FROM match_candidates
      WHERE (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
        AND (${toParam}::timestamptz IS NULL OR created_at <= ${toParam}::timestamptz);
    `;

    // 3. Median time to first accept (seconds)
    const ttfaQuery = sql`
      WITH first_accepts AS (
        SELECT 
          r.id AS request_id,
          EXTRACT(EPOCH FROM (MIN(mc.responded_at) - r.created_at)) AS seconds_to_first_accept
        FROM blood_requests r
        JOIN match_runs mr ON mr.request_id = r.id
        JOIN match_candidates mc ON mc.run_id = mr.id
        WHERE mc.response = 'accepted'
          AND mc.responded_at IS NOT NULL
          AND mc.responded_at >= r.created_at
          AND (${fromParam}::timestamptz IS NULL OR r.created_at >= ${fromParam}::timestamptz)
          AND (${toParam}::timestamptz IS NULL OR r.created_at <= ${toParam}::timestamptz)
        GROUP BY r.id, r.created_at
      )
      SELECT 
        COALESCE(
          ROUND(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds_to_first_accept)::numeric,
            2
          )::float,
          0.0
        ) AS median_ttfa
      FROM first_accepts;
    `;

    // 4. Match runs metrics (degraded rate, radius expansion frequency)
    const matchRunsQuery = sql`
      SELECT
        COUNT(*)::int AS total_runs,
        COALESCE(
          ROUND(
            (COUNT(*) FILTER (WHERE degraded = true)::numeric / NULLIF(COUNT(*), 0)::numeric),
            4
          )::float,
          0.0
        ) AS degraded_run_rate,
        COALESCE(
          ROUND(
            (COUNT(*) FILTER (
              WHERE COALESCE((config->>'expansionSteps')::int, 1) > 1
                 OR (config->>'finalRadiusMeters')::numeric > (config->>'initialRadiusMeters')::numeric
            )::numeric / NULLIF(COUNT(*), 0)::numeric),
            4
          )::float,
          0.0
        ) AS radius_expansion_frequency
      FROM match_runs
      WHERE (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
        AND (${toParam}::timestamptz IS NULL OR created_at <= ${toParam}::timestamptz);
    `;

    const [reqResult, candResult, ttfaResult, runsResult] = await Promise.all([
      this.db.execute(requestsQuery),
      this.db.execute(candidatesQuery),
      this.db.execute(ttfaQuery),
      this.db.execute(matchRunsQuery)
    ]);

    const reqRow = (reqResult.rows[0] ?? {}) as Record<string, unknown>;
    const candRow = (candResult.rows[0] ?? {}) as Record<string, unknown>;
    const ttfaRow = (ttfaResult.rows[0] ?? {}) as Record<string, unknown>;
    const runsRow = (runsResult.rows[0] ?? {}) as Record<string, unknown>;

    return {
      requestsByStatus: {
        open: Number(reqRow.open ?? 0),
        matching: Number(reqRow.matching ?? 0),
        fulfilled: Number(reqRow.fulfilled ?? 0),
        cancelled: Number(reqRow.cancelled ?? 0),
        expired: Number(reqRow.expired ?? 0),
        total: Number(reqRow.total ?? 0)
      },
      fulfillmentRate: Number(reqRow.fulfillment_rate ?? 0),
      responseRate: Number(candRow.response_rate ?? 0),
      totalNotifications: Number(candRow.total_notifications ?? 0),
      medianTimeToFirstAcceptSeconds: Number(ttfaRow.median_ttfa ?? 0),
      degradedRunRate: Number(runsRow.degraded_run_rate ?? 0),
      radiusExpansionFrequency: Number(runsRow.radius_expansion_frequency ?? 0),
      totalMatchRuns: Number(runsRow.total_runs ?? 0),
      timestamp: new Date().toISOString()
    };
  }
}
