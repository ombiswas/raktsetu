import { z } from 'zod';
import type {
  DemandForecastRequest,
  DemandForecastResult,
  IForecastingMlClient
} from './forecasting.types.js';

const mlForecastPointSchema = z.object({
  step: z.number().int(),
  date: z.string().optional(),
  predicted_units: z.number().nonnegative()
});

const mlForecastResponseSchema = z.object({
  forecast: z.array(mlForecastPointSchema),
  model_version: z.string(),
  horizon: z.number().int(),
  timestamp: z.string().optional(),
  disclaimer: z.string().optional()
});

export interface ForecastingMlClientOptions {
  baseUrl: string;
  token?: string | undefined;
  timeoutMs?: number | undefined;
}

export class ForecastingMlClient implements IForecastingMlClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: ForecastingMlClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token ?? 'raktsetu-dev-ml-token-secret-2026';
    this.timeoutMs = options.timeoutMs ?? 2000;
  }

  public async forecastDemand(req: DemandForecastRequest): Promise<DemandForecastResult | null> {
    const url = `${this.baseUrl}/v1/forecast`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json'
        },
        body: JSON.stringify({
          series: req.series,
          horizon: req.horizon,
          blood_group: req.bloodGroup,
          component: req.component
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        return null;
      }

      const rawJson: unknown = await response.json();
      const parsed = mlForecastResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        return null;
      }

      return {
        modelVersion: parsed.data.model_version,
        horizon: parsed.data.horizon,
        forecast: parsed.data.forecast.map((pt, idx) => ({
          step: pt.step,
          date: pt.date ?? new Date(Date.now() + (idx + 1) * 86400000).toISOString().slice(0, 10),
          predictedUnits: pt.predicted_units
        }))
      };
    } catch {
      return null;
    }
  }
}
