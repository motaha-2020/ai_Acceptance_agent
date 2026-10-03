import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { startEmbeddedPostgres } from '../embedded.js';
import { runMigrations } from '../migrate.js';

export interface TestDatabase {
  url: string;
  stop(): Promise<void>;
}

/** Ask the OS for a free TCP port. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Start a throw-away PostgreSQL 16 (embedded, no Docker), create a database and apply all
 * migrations. Intended for vitest globalSetup.
 */
export async function startTestDatabase(name = 'acceptance_test'): Promise<TestDatabase> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'acceptance-pg-'));
  const pg = await startEmbeddedPostgres({ dataDir: path.join(dir, 'data'), port: await freePort(), persistent: false });
  try {
    await pg.createDatabase(name);
    const url = pg.urlFor(name);
    await runMigrations(url);
    return {
      url,
      async stop() {
        await pg.stop();
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      },
    };
  } catch (err) {
    await pg.stop().catch(() => undefined);
    throw err;
  }
}
