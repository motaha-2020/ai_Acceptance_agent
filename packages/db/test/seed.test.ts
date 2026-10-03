import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, parseGpsForTest, seedDatabase, verifyPassword, type PrismaClient } from './helpers.js';
import { startTestDatabase, type TestDatabase } from '../src/testing/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const nasr3SeedPath = path.join(repoRoot, 'data', 'sites', 'nasr3-r21c.json');

let db: TestDatabase;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await startTestDatabase('seed_test');
  prisma = createPrismaClient(db.url);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await db?.stop();
});

describe('seedDatabase', () => {
  it('creates roles, admin, project, 4 sites, checklists and disabled autonomy policies', async () => {
    const summary = await seedDatabase(prisma, { adminEmail: 'Admin@Example.com', adminPassword: 'correct horse battery', nasr3SeedPath });
    expect(summary.roles).toBe(6);
    expect(summary.siteIds).toHaveLength(4);
    expect(await prisma.role.count()).toBe(6);
    expect(await prisma.permission.count()).toBe(summary.permissions);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' }, include: { role: true } });
    expect(admin.role.name).toBe('admin');
    expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(admin.passwordHash, 'correct horse battery')).toBe(true);

    const nasr3 = await prisma.site.findUniqueOrThrow({ where: { code: 'nasr3-r21c' }, include: { devices: true } });
    expect(nasr3.devices[0]?.model).toBe('ASR-9906');
    expect(nasr3.devices[0]?.hostname).toBe('NASR3-R21C-C-EG');

    expect(await prisma.checklistTemplate.count()).toBe(summary.checklistTemplates);
    expect(await prisma.checklistItem.count()).toBeGreaterThan(20);
    const policies = await prisma.autonomyPolicy.findMany();
    expect(policies).toHaveLength(20);
    expect(policies.every((p) => !p.enabled)).toBe(true);
  });

  it('is idempotent and never resets a changed admin password', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    await seedDatabase(prisma, { adminEmail: 'admin@example.com', adminPassword: 'another password!', nasr3SeedPath });
    const after = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.site.count()).toBe(4);
    expect(await prisma.device.count()).toBe(4);
  });

  it('rejects a short admin password', async () => {
    await expect(seedDatabase(prisma, { adminEmail: 'x@example.com', adminPassword: 'short' })).rejects.toThrow(/at least 10/);
  });
});

describe('append-only tables', () => {
  it('blocks UPDATE and DELETE on audit_logs', async () => {
    const row = await prisma.auditLog.create({ data: { action: 'test', method: 'POST', path: '/x', statusCode: 200 } });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE audit_logs')).rejects.toThrow(/append-only/);
  });
});

describe('parseGps', () => {
  it('keeps valid coordinates and drops out-of-range ones', () => {
    expect(parseGpsForTest('30.0500°N,31.3333°E')).toEqual({ lat: 30.05, lng: 31.3333 });
    expect(parseGpsForTest('30.0500°N,3131.3333° “E')).toEqual({ lat: 30.05, lng: undefined });
    expect(parseGpsForTest(null)).toEqual({});
  });
});
