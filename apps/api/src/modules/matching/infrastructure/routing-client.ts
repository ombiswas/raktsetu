/**
 * Routing Client Infrastructure
 * Optional external routing integration with OpenRouteService.
 * Designed with strict emergency timeout, zero retry loops, and safe fallback.
 */

export interface RouteMatrixResult {
  distanceMeters: number;
  durationSeconds: number;
}

export interface IRoutingClient {
  calculateRoute(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number }
  ): Promise<RouteMatrixResult | null>;
}

/**
 * No-op routing client that performs zero network calls.
 * Used as the default baseline implementation.
 */
export class NoOpRoutingClient implements IRoutingClient {
  public async calculateRoute(
    _origin: { latitude: number; longitude: number },
    _destination: { latitude: number; longitude: number }
  ): Promise<RouteMatrixResult | null> {
    return null;
  }
}

export interface OpenRouteServiceConfig {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  enabled?: boolean | undefined;
}

/**
 * OpenRouteService implementation.
 * Feature-flagged, strictly timed out, retry-free.
 */
export class OpenRouteServiceClient implements IRoutingClient {
  private readonly apiKey?: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;

  constructor(config: OpenRouteServiceConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openrouteservice.org';
    this.timeoutMs = config.timeoutMs ?? 2000;
    this.enabled = Boolean(config.enabled && config.apiKey);
  }

  public async calculateRoute(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number }
  ): Promise<RouteMatrixResult | null> {
    if (!this.enabled || !this.apiKey) {
      return null;
    }

    try {
      const url = `${this.baseUrl}/v2/directions/driving-car`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          coordinates: [
            [origin.longitude, origin.latitude],
            [destination.longitude, destination.latitude]
          ]
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        routes?: Array<{
          summary?: {
            distance?: number;
            duration?: number;
          };
        }>;
      };

      const summary = data.routes?.[0]?.summary;
      if (
        !summary ||
        typeof summary.distance !== 'number' ||
        typeof summary.duration !== 'number'
      ) {
        return null;
      }

      return {
        distanceMeters: Math.round(summary.distance),
        durationSeconds: Math.round(summary.duration)
      };
    } catch {
      // Emergency rule: Never retry or throw; fall back to geodesic straight-line distance
      return null;
    }
  }
}
