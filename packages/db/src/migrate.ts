import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of prisma/schema.prisma (works from src/ and dist/). */
export const schemaPath = path.resolve(here, '..', 'prisma', 'schema.prisma');

/** Apply all pending migrations (`prisma migrate deploy`) to the given database. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const require = createRequire(import.meta.url);
  const cli = require.resolve('prisma/build/index.js');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy', '--schema', schemaPath], {
      env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`prisma migrate deploy failed (exit ${code}):\n${output}`)),
    );
  });
}
