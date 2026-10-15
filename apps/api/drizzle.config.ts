import { defineConfig } from 'drizzle-kit';
import fs from 'node:fs';
import path from 'node:path';

if (typeof process.loadEnvFile === 'function') {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, 'apps', 'api', '.env'),
    path.join(__dirname, '.env')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        process.loadEnvFile(p);
        if (process.env.DATABASE_URL) break;
      } catch {
        // continue
      }
    }
  }
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/platform/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/raktsetu'
  }
});

