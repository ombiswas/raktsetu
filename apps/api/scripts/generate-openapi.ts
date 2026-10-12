import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { createConfig } from '../src/platform/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate(): Promise<void> {
  const cfg = createConfig({
    ...process.env,
    NODE_ENV: 'development'
  });

  const app = await buildApp({ config: cfg });
  await app.ready();

  const openapiSpec = app.swagger();

  // Root docs directory: repo/docs/openapi.json
  const docsDir = path.resolve(__dirname, '../../../docs');
  const targetPath = path.join(docsDir, 'openapi.json');

  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(openapiSpec, null, 2), 'utf-8');

  console.log(`Successfully generated OpenAPI specification at: ${targetPath}`);

  await app.close();
}

generate().catch((err) => {
  console.error('Error generating OpenAPI specification:', err);
  process.exit(1);
});
