import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../../platform/database/connection.js';
import { bloodRequests, demandForecasts } from '../../platform/database/schema.js';
import type {
  BloodComponent,
  BloodGroup,
  IForecastingRepository,
  StoredForecastRow
} from './forecasting.types.js';

export class ForecastingRepository implements IForecastingRepository {
  constructor(private readonly db: DatabaseInstance) {}

  public async getDailyAggregatedDemand(options: {
    startDate: string;
    endDate: string;
    bloodGroup?: BloodGroup | undefined;
    component?: BloodComponent | undefined;
  }) {
    const conditions = [
      gte(bloodRequests.createdAt, new Date(`${options.startDate}T00:00:00.000Z`)),
      lte(bloodRequests.createdAt, new Date(`${options.endDate}T23:59:59.999Z`))
    ];

    if (options.bloodGroup) {
      conditions.push(eq(bloodRequests.bloodGroup, options.bloodGroup));
    }
    if (options.component) {
      conditions.push(eq(bloodRequests.component, options.component));
    }

    const rows = await this.db
      .select({
        date: sql<string>`TO_CHAR(${bloodRequests.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        bloodGroup: bloodRequests.bloodGroup,
        component: bloodRequests.component,
        units: sql<number>`COALESCE(SUM(${bloodRequests.unitsRequired}), 0)::float`
      })
      .from(bloodRequests)
      .where(and(...conditions))
      .groupBy(
        sql`TO_CHAR(${bloodRequests.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        bloodRequests.bloodGroup,
        bloodRequests.component
      )
      .orderBy(sql`TO_CHAR(${bloodRequests.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD') ASC`);

    return rows.map((r) => ({
      date: r.date,
      bloodGroup: r.bloodGroup as BloodGroup,
      component: r.component as BloodComponent,
      units: Number(r.units)
    }));
  }

  public async upsertDemandForecasts(
    forecasts: Array<{
      bloodGroup: BloodGroup;
      component: BloodComponent;
      horizonStart: Date;
      horizonEnd: Date;
      predictedUnits: number;
      modelVersion: string;
    }>
  ): Promise<number> {
    if (forecasts.length === 0) {
      return 0;
    }

    const now = new Date();
    await this.db
      .insert(demandForecasts)
      .values(
        forecasts.map((f) => ({
          bloodGroup: f.bloodGroup,
          component: f.component,
          horizonStart: f.horizonStart,
          horizonEnd: f.horizonEnd,
          predictedUnits: f.predictedUnits,
          modelVersion: f.modelVersion,
          createdAt: now
        }))
      )
      .onConflictDoUpdate({
        target: [
          demandForecasts.bloodGroup,
          demandForecasts.component,
          demandForecasts.horizonStart
        ],
        set: {
          predictedUnits: sql`EXCLUDED.predicted_units`,
          modelVersion: sql`EXCLUDED.model_version`,
          horizonEnd: sql`EXCLUDED.horizon_end`,
          createdAt: now
        }
      });

    return forecasts.length;
  }

  public async getLatestForecasts(options: {
    bloodGroup: BloodGroup;
    component: BloodComponent;
    fromDate?: Date | undefined;
  }): Promise<StoredForecastRow[]> {
    const conditions = [
      eq(demandForecasts.bloodGroup, options.bloodGroup),
      eq(demandForecasts.component, options.component)
    ];

    if (options.fromDate) {
      conditions.push(gte(demandForecasts.horizonStart, options.fromDate));
    }

    const rows = await this.db
      .select()
      .from(demandForecasts)
      .where(and(...conditions))
      .orderBy(demandForecasts.horizonStart);

    return rows.map((r) => ({
      id: r.id,
      bloodGroup: r.bloodGroup as BloodGroup,
      component: r.component as BloodComponent,
      horizonStart: r.horizonStart,
      horizonEnd: r.horizonEnd,
      predictedUnits: r.predictedUnits,
      modelVersion: r.modelVersion,
      createdAt: r.createdAt
    }));
  }
}
