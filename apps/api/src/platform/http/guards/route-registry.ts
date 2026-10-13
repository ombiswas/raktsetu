import type { FastifyInstance, RouteOptions } from 'fastify';
import type { UserRole, RoutePolicyConfig } from './types.js';

export interface RouteRegistryEntry {
  method: string | string[];
  url: string;
  isPublic: boolean;
  auth: boolean;
  roles?: UserRole[] | undefined;
}

export class RouteRegistry {
  private readonly routes: RouteRegistryEntry[] = [];

  /**
   * Registers a route policy entry from Fastify route options.
   */
  public register(routeOptions: RouteOptions): void {
    const config = (routeOptions.config ?? {}) as RoutePolicyConfig;
    const isPublic = config.isPublic === true;
    const auth = config.auth === true;
    const roles = config.roles;

    this.routes.push({
      method: routeOptions.method,
      url: routeOptions.url,
      isPublic,
      auth,
      roles
    });
  }

  /**
   * Returns all recorded route entries.
   */
  public getRoutes(): readonly RouteRegistryEntry[] {
    return this.routes;
  }

  /**
   * Validates that every non-public route explicitly declares auth: true and a non-empty roles list.
   * Returns a list of offending routes.
   */
  public findViolations(): RouteRegistryEntry[] {
    return this.routes.filter((route) => {
      // Exclude automatic/documentation routes from policy requirement
      const url = route.url.toLowerCase();
      if (url.startsWith('/docs') || url.startsWith('/health')) {
        return false;
      }

      if (route.isPublic) {
        return false;
      }

      // Non-public routes MUST declare both auth: true and at least one role
      const hasValidAuth = route.auth === true;
      const hasValidRoles = Array.isArray(route.roles) && route.roles.length > 0;

      return !hasValidAuth || !hasValidRoles;
    });
  }
}

/**
 * Fastify plugin that registers the onRoute hook for tracking route policies.
 */
export function registerRouteRegistry(app: FastifyInstance, registry: RouteRegistry): void {
  app.addHook('onRoute', (routeOptions) => {
    registry.register(routeOptions);
  });
}

