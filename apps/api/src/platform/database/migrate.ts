import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { DatabaseInstance } from './connection.js';
import { createDbPool, createDrizzle } from './connection.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_MIGRATIONS_FOLDER = path.resolve(__dirname, '../../../drizzle');

/**
 * Runs Drizzle migrations programmatically against the target database.
 * Ensures the migration journal is followed and __drizzle_migrations table is maintained.
 */
export async function runMigrations(
  db: DatabaseInstance,
  migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER
): Promise<void> {
  await migrate(db, { migrationsFolder });
}

// Allow direct execution via tsx / node
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const pool = createDbPool(config);
  const db = createDrizzle(pool);

  console.log(`Applying migrations from: ${DEFAULT_MIGRATIONS_FOLDER}`);
  runMigrations(db)
    .then(async () => {
      console.log('Migrations applied successfully.');
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await pool.end();
      process.exit(1);
    });
}
