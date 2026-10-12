import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { type Config, config as defaultPlatformConfig } from '../config/index.js';
import * as schema from './schema.js';

const { Pool } = pg;

export type DatabaseInstance = NodePgDatabase<typeof schema>;

export interface DatabasePoolOptions {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

/**
 * Creates and configures a PostgreSQL connection pool from application config.
 * Enforces SSL in production and applies statement timeout safeguards.
 */
export function createDbPool(
  cfg: Config = defaultPlatformConfig,
  options: DatabasePoolOptions = {}
): pg.Pool {
  const isProd = cfg.isProduction;

  // SSL is required in production environments
  const sslConfig = isProd
    ? { rejectUnauthorized: true }
    : cfg.DATABASE_URL.includes('sslmode=require') || cfg.DATABASE_URL.includes('ssl=true')
      ? { rejectUnauthorized: false }
      : false;

  const pool = new Pool({
    connectionString: cfg.DATABASE_URL,
    max: options.max ?? (isProd ? 20 : 10),
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
    statement_timeout: options.statementTimeoutMillis ?? 10000,
    ssl: sslConfig
  });

  // Handle unexpected idle client errors
  pool.on('error', (err) => {
    console.error('Unexpected idle PostgreSQL client error:', err);
  });

  return pool;
}

/**
 * Creates a Drizzle ORM database instance wrapping the pg pool with full schema types.
 */
export function createDrizzle(pool: pg.Pool): DatabaseInstance {
  return drizzle(pool, { schema });
}

/**
 * Executes a callback within a managed database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Readiness probe: checks if the database connection pool is responsive.
 */
export async function checkDatabaseReadiness(pool: pg.Pool): Promise<boolean> {
  let client: pg.PoolClient | null = null;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT 1 as ready');
    return result.rows[0]?.ready === 1;
  } catch {
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}
