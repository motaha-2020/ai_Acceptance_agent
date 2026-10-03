import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../index.js';
import { seedDatabase } from '../seed.js';

/**
 * Seed CLI. Env:
 *   DATABASE_URL          target database (required)
 *   SEED_ADMIN_EMAIL      default admin@acceptance.local
 *   SEED_ADMIN_PASSWORD   required, >= 10 chars
 *   SITE_SEED_PATH        default <repo>/data/sites/nasr3-r21c.json
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

async function main(): Promise<void> {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!password) throw new Error('SEED_ADMIN_PASSWORD is required');
  const prisma = createPrismaClient();
  try {
    const summary = await seedDatabase(prisma, {
      adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@acceptance.local',
      adminPassword: password,
      nasr3SeedPath: process.env.SITE_SEED_PATH ?? path.join(repoRoot, 'data', 'sites', 'nasr3-r21c.json'),
      log: (m) => console.log(`[seed] ${m}`),
    });
    console.log('[seed] done', JSON.stringify(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
