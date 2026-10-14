import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Vercel Rewrites & Security Headers Validation', () => {
  it('enforces same-origin API rewrite and strict security headers in vercel.json', () => {
    const vercelConfigPath = path.resolve(__dirname, '../../vercel.json');
    expect(fs.existsSync(vercelConfigPath), 'vercel.json must exist in apps/web').toBe(true);

    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    // 1. Same-Origin /api rewrite
    expect(config.rewrites).toBeDefined();
    const apiRewrite = config.rewrites.find((r: { source: string }) => r.source.startsWith('/api'));
    expect(apiRewrite, 'Rewrite for /api must exist').toBeDefined();
    expect(apiRewrite.destination).toContain('raktsetu-api.onrender.com');

    // 2. Security Headers
    expect(config.headers).toBeDefined();
    const globalHeaders = config.headers[0]?.headers as { key: string; value: string }[];
    expect(globalHeaders).toBeDefined();

    const headersMap = new Map(globalHeaders.map((h) => [h.key, h.value]));

    // CSP checks
    const csp = headersMap.get('Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");

    // X-Frame-Options
    expect(headersMap.get('X-Frame-Options')).toBe('DENY');

    // Referrer-Policy
    expect(headersMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');

    // Permissions-Policy
    const permissions = headersMap.get('Permissions-Policy');
    expect(permissions).toBeDefined();
    expect(permissions).toContain('geolocation=(self)');
    expect(permissions).toContain('camera=()');
    expect(permissions).toContain('microphone=()');
  });
});
