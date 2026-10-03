import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from '../embedded.js';
import { runMigrations } from '../migrate.js';

/**
 * Local PostgreSQL 16 without Docker. Data persists in <repo>/.data/postgres.
 * Env: PG_PORT (default 5432), PG_DATABASE (default acceptance).
 * Prints the DATABASE_URL to put in .env, applies migrations, then runs until Ctrl+C.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

async function main(): Promise<void> {
  const port = Number(process.env.PG_PORT ?? 5432);
  const database = process.env.PG_DATABASE ?? 'acceptance';
  const pg = await startEmbeddedPostgres({
    dataDir: path.join(repoRoot, '.data', 'postgres'),
    port,
    user: 'acceptance',
    password: 'acceptance',
    persistent: true,
  });
  await pg.createDatabase(database);
  const url = pg.urlFor(database);
  await runMigrations(url);
  console.log(`[db] PostgreSQL 16 running. DATABASE_URL=${url}`);
  const shutdown = async (): Promise<void> => {
    console.log('[db] stopping...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
