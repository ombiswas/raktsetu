import { describe, it, expect } from 'vitest';
import { buildApp } from '../../src/app.js';
import { RouteRegistry } from '../../src/platform/http/guards/route-registry.js';
import { createConfig } from '../../src/platform/config/index.js';

describe('Route Registry & Deny-by-Default Policy Test', () => {
  it('asserts that every non-public route in the application explicitly declares auth: true and a valid roles list', async () => {
    const cfg = createConfig({
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-chars-long!',
      COOKIE_SECRET: 'test-cookie-secret-at-least-32-chars-long!'
    });

    const registry = new RouteRegistry();
    const app = await buildApp({
      config: cfg,
      routeRegistry: registry,
      checkDatabase: async () => true
    });

    await app.ready();

    // Verify there are no violations in the live application
    const violations = registry.findViolations();
    if (violations.length > 0) {
      console.error('Found unprotected routes violating deny-by-default policy:', violations);
    }
    expect(violations).toEqual([]);

    await app.close();
  });

  it('fails the test when an unprotected route without public or auth configuration is registered', async () => {
    const cfg = createConfig({
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-chars-long!',
      COOKIE_SECRET: 'test-cookie-secret-at-least-32-chars-long!'
    });

    const registry = new RouteRegistry();
    const app = await buildApp({
      config: cfg,
      routeRegistry: registry,
      checkDatabase: async () => true
    });

    // Add an intentionally unprotected route violating deny-by-default policy
    app.get('/v1/rogue-endpoint', async () => ({ secret: 'unprotected' }));

    await app.ready();

    const violations = registry.findViolations();
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.url === '/v1/rogue-endpoint')).toBe(true);

    await app.close();
  });
});
