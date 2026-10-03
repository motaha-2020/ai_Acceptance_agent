import { writeFile } from 'node:fs/promises';
import { pino } from 'pino';
import { InMemoryJobQueue } from '@acceptance/queue';
import { buildOpenApi, createApp } from '../app.js';
import { loadConfig } from '../config/config.js';

/** Writes the OpenAPI document to openapi.json (no database connection needed). */
async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'x'.repeat(32),
    STORAGE_SIGNING_SECRET: process.env.STORAGE_SIGNING_SECRET ?? 'x'.repeat(32),
    EMBEDDED_WORKER: 'false',
    SWAGGER_ENABLED: 'false',
  });
  const app = await createApp(config, { logger: pino({ level: 'warn' }), overrides: { queue: new InMemoryJobQueue() } });
  const out = process.argv[2] ?? 'openapi.json';
  await writeFile(out, JSON.stringify(buildOpenApi(app), null, 2));
  await app.close();
  console.log(`OpenAPI written to ${out}`);
}

void main();
