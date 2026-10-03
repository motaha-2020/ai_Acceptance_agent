import { PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient } from '@prisma/client';
export type * from '@prisma/client';
export { hashPassword, verifyPassword, needsRehash } from './password.js';
export { runMigrations, schemaPath } from './migrate.js';
export { seedDatabase, type SeedOptions, type SeedSummary } from './seed.js';
export { computeAgreement, type AgreementFilter, type CategoryAgreement } from './metrics.js';
export { startEmbeddedPostgres, type EmbeddedPostgresHandle, type EmbeddedPostgresOptions } from './embedded.js';

/** Create a Prisma client for an explicit URL (falls back to DATABASE_URL). */
export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

/** Prisma error code for unique constraint violations. */
export const UNIQUE_VIOLATION = 'P2002';
/** Prisma error code for "record not found" on update/delete. */
export const RECORD_NOT_FOUND = 'P2025';
