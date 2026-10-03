import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Real PostgreSQL 16 without Docker (binaries from the `embedded-postgres` npm package).
 * Used for local development and for integration tests. Production uses the postgres:16
 * container from docker compose.
 */
export interface EmbeddedPostgresOptions {
  dataDir: string;
  port: number;
  user?: string;
  password?: string;
  /** Keep the data directory after stop (dev). Tests use false. */
  persistent?: boolean;
  onLog?: (message: string) => void;
}

export interface EmbeddedPostgresHandle {
  /** Server URL without database, e.g. postgresql://postgres:postgres@127.0.0.1:5433 */
  serverUrl: string;
  urlFor(database: string): string;
  createDatabase(name: string): Promise<void>;
  stop(): Promise<void>;
}

export async function startEmbeddedPostgres(opts: EmbeddedPostgresOptions): Promise<EmbeddedPostgresHandle> {
  const user = opts.user ?? 'postgres';
  const password = opts.password ?? 'postgres';
  const log = opts.onLog ?? (() => undefined);
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user,
    password,
    port: opts.port,
    persistent: opts.persistent ?? false,
    // Windows initdb defaults to WIN1252; Arabic text needs UTF-8 (same as the production container).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: (m: unknown) => log(String(m)),
    onError: (m: unknown) => log(String(m)),
  });

  const initialised = existsSync(path.join(opts.dataDir, 'PG_VERSION'));
  if (!initialised) {
    await mkdir(path.dirname(opts.dataDir), { recursive: true });
    await pg.initialise();
  }
  await pg.start();

  const serverUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${opts.port}`;
  return {
    serverUrl,
    urlFor: (database) => `${serverUrl}/${database}`,
    async createDatabase(name) {
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`invalid database name: ${name}`);
      const client = pg.getPgClient();
      await client.connect();
      try {
        const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
        if (exists.rowCount === 0) await client.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
      } finally {
        await client.end();
      }
    },
    stop: () => pg.stop(),
  };
}
