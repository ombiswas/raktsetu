/**
 * Production Release Migration Script
 *
 * Designed to execute as a pre-deploy or release step (e.g. Render Pre-Deploy Command
 * or GitHub Actions release step against Neon PostgreSQL).
 *
 * Actions:
 * 1. Connects to DATABASE_URL with SSL handling for cloud PostgreSQL.
 * 2. Idempotently creates the PostGIS spatial extension ('CREATE EXTENSION IF NOT EXISTS postgis;').
 * 3. Applies all unapplied SQL migrations from the drizzle/ directory.
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, 'apps', 'api', '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../apps/api/.env')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        process.loadEnvFile(p);
        break;
      } catch {
        // Continue
      }
    }
  }
}

async function runReleaseMigration(): Promise<void> {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[release-migrate] ERROR: DATABASE_URL environment variable is not defined');
    process.exit(1);
  }

  const isNeonOrCloud =
    connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production';

  const ssl = isNeonOrCloud ? { rejectUnauthorized: false } : undefined;

  const client = new pg.Client({
    connectionString,
    ssl
  });

  try {
    console.log('[release-migrate] Connecting to target PostgreSQL database...');
    await client.connect();

    console.log('[release-migrate] Ensuring PostGIS extension is enabled...');
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    console.log('[release-migrate] PostGIS extension verified.');

    const migrationsFolder = path.resolve(__dirname, '../drizzle');
    console.log(`[release-migrate] Applying Drizzle migrations from ${migrationsFolder}...`);

    const db = drizzle(client);
    await migrate(db, { migrationsFolder });

    console.log('[release-migrate] All migrations applied successfully.');
  } catch (err) {
    console.error('[release-migrate] FATAL: Database migration step failed:', err);
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch {
      // Ignored on teardown
    }
  }
}

void runReleaseMigration();
