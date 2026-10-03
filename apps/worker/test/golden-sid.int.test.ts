/**
 * T6.4 golden test: generate the NASR3 report from seeded data and compare it structurally with the
 * real SID docx (read-only customer file). Skips when the git-ignored seed JSON or the customer
 * folder is absent (CI). Writes the sample to data/reports/ for manual review.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, seedDatabase, type PrismaClient } from '@acceptance/db';
import { startTestDatabase, type TestDatabase } from '@acceptance/db/testing';
import { parseDocxContent, parseSidContent, readDocxContent, SiteSeed, type DocxContent, type DocxTable } from '@acceptance/parsers';
import { JobName } from '@acceptance/queue';
import { SECTIONS } from '@acceptance/report';
import { LocalObjectStorage } from '@acceptance/storage';
import { defaultPdfConverter, GenerateReportProcessor, type Logger } from '../src/index.js';

const REPO = path.resolve(import.meta.dirname, '../../..');
const SEED = path.join(REPO, 'data/sites/nasr3-r21c.json');
const RAW_ROOT = path.resolve(REPO, '..');
const SID_DIR = path.join(RAW_ROOT, 'NASR3...C(R21C)/NASR3...C(R21C)');
const OUT_DIR = path.join(REPO, 'data/reports');
const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

/** SID heading per report section (the SID writes "HLD." for the LLD section and "Photo gallery."). */
const SID_HEADING: Record<string, RegExp> = {
  siteData: /^Site Data:?$/i, survey: /^Facility Survey Report:?$/i, layouts: /^Layouts:?$/i, lld: /^(HLD|LLD)\.?$/i,
  fiber: /^Fiber Connectivity:?$/i, power: /^Power Connectivity:?$/i, bom: /^Site BOM:?$/i, odf: /^ODF utilization and port mapping:?$/i,
  tests: /^Fiber connectivity and splicing test results:?$/i, config: /^Configuration file:?$/i, checklist: /^Acceptance check list\.?$/i, gallery: /^Photo gallery\.?$/i,
};

function headingIndexes(c: DocxContent): number[] {
  const body = c.paragraphs.findIndex((p) => /^Site Data:$/i.test(p)); // skip the "Content:" list
  return SECTIONS.map((s) => {
    const i = c.paragraphs.slice(body).findIndex((p) => SID_HEADING[s.key]!.test(p.trim()));
    return i < 0 ? -1 : i + body;
  });
}

const tableAfter = (c: DocxContent, re: RegExp): DocxTable | undefined => c.tables.find((t) => re.test(t.heading ?? ''));
const serialsOf = (cellText: string): string[] => cellText.split(/[\s,/|]+/).filter(Boolean).sort();
const rowsWithHeader = (c: DocxContent, first: string): string[][] => (c.tables.find((t) => t.rows[0]?.[0] === first)?.rows ?? []).slice(1).map((r) => r.map((x) => x.trim()));

let db: TestDatabase;
let prisma: PrismaClient;
let dir: string;
let generated: DocxContent;
let generatedXml: string;
let sid: DocxContent | null = null;
let seed: SiteSeed;

describe.skipIf(!existsSync(SEED))('golden: NASR3 report vs real SID', () => {
  beforeAll(async () => {
    seed = SiteSeed.parse(JSON.parse(await readFile(SEED, 'utf8')));
    db = await startTestDatabase('golden_test');
    prisma = createPrismaClient(db.url);
    const s = await seedDatabase(prisma, { adminEmail: 'admin@example.com', adminPassword: 'admin-password-1', adminName: 'Golden Admin', nasr3SeedPath: SEED });
    dir = await mkdtemp(path.join(os.tmpdir(), 'golden-storage-'));
    const storage = new LocalObjectStorage({ rootDir: dir, publicBaseUrl: 'http://x/files', signingSecret: 'k' });
    const site = await prisma.site.findUniqueOrThrow({ where: { code: 'nasr3-r21c' } });

    // Two real NASR3 photos per category as APPROVED photos (when the customer folder is present).
    const catalog = path.join(REPO, 'data/photo_catalog.jsonl');
    if (existsSync(catalog)) {
      const visit = await prisma.visit.create({ data: { siteId: site.id, title: 'Installation', createdById: s.adminUserId } });
      const rows = (await readFile(catalog, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { site: string; category: string; relPath: string; sha256: string });
      const perCat = new Map<string, number>();
      for (const r of rows.filter((x) => x.site.startsWith('NASR3'))) {
        const file = path.join(RAW_ROOT, r.relPath);
        if ((perCat.get(r.category) ?? 0) >= 2 || !existsSync(file)) continue;
        perCat.set(r.category, (perCat.get(r.category) ?? 0) + 1);
        const category = r.category as 'rack';
        const sub = await prisma.submission.upsert({ where: { visitId_category: { visitId: visit.id, category } }, update: {}, create: { visitId: visit.id, category } });
        const key = `photos/${r.sha256}/web.jpg`;
        await storage.put(key, await readFile(file), { contentType: 'image/jpeg' });
        await prisma.photo.create({ data: { clientUuid: randomUUID(), submissionId: sub.id, visitId: visit.id, siteId: site.id, category, status: 'approved', sha256: r.sha256, mimeType: 'image/jpeg', sizeBytes: 1, originalKey: key, webKey: key, thumbKey: key, uploadedById: s.adminUserId } });
      }
    }

    const report = await prisma.report.create({ data: { siteId: site.id, version: 1, draft: false, createdById: s.adminUserId } });
    await new GenerateReportProcessor({ prisma, storage, logger: silent, pdf: defaultPdfConverter() }).handle({ id: 'g', name: JobName.generateReport, data: { reportId: report.id }, attempt: 1, maxAttempts: 1 });
    const done = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    const docx = await storage.get(done.docxKey!);
    generatedXml = await (await JSZip.loadAsync(docx)).file('word/document.xml')!.async('string');
    generated = parseDocxContent(generatedXml);

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(path.join(OUT_DIR, 'nasr3-r21c-sample.docx'), docx);
    if (done.pdfKey) await writeFile(path.join(OUT_DIR, 'nasr3-r21c-sample.pdf'), await storage.get(done.pdfKey));
    await writeFile(path.join(OUT_DIR, 'nasr3-r21c-sample.json'), JSON.stringify({ warnings: done.warnings, meta: done.meta, docxBytes: done.docxBytes }, null, 2));

    const sidName = existsSync(SID_DIR) ? (await readdir(SID_DIR)).find((n) => /SID.*\.docx$/i.test(n)) : undefined;
    if (sidName) sid = await readDocxContent(path.join(SID_DIR, sidName));
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('has the 12 SID sections in SID order', () => {
    const g = headingIndexes(generated);
    expect(g.every((i) => i >= 0)).toBe(true);
    expect([...g].sort((a, b) => a - b)).toEqual(g);
    if (sid) {
      const s = headingIndexes(sid);
      expect(s.every((i) => i >= 0)).toBe(true);
      expect([...s].sort((a, b) => a - b)).toEqual(s);
    }
  });

  it('Site Data fields equal the SID values', () => {
    const ours = parseSidContent(generated).siteData;
    const expected = sid ? parseSidContent(sid).siteData : seed.siteData;
    for (const k of ['siteName', 'region', 'room', 'racks', 'project', 'deviceBrand', 'deviceModel', 'deviceSerial', 'hostname', 'loopbackIp', 'managementSource', 'installationType', 'gps', 'contractNumber', 'announcementDate', 'installationDate', 'contractor'] as const) {
      expect.soft(ours[k], k).toBe(expected[k]);
    }
  });

  it('BOM rows, quantities and serials equal the SID', () => {
    const rows = tableAfter(generated, /Active & Passive quantities/)!.rows.slice(1);
    const ours = rows.map((r) => ({ partNumber: r[1], qty: Number(r[2]), serials: serialsOf(r[3] ?? '') }));
    const ref = (sid ? parseSidContent(sid).bom : seed.sidBom).map((b) => ({ partNumber: b.partNumber, qty: b.qty, serials: [...b.serials].sort() }));
    expect(ours).toEqual(ref);
    const passive = (c: DocxContent, re: RegExp) => tableAfter(c, re)!.rows.slice(1).map((r) => [r[0], r[2]]);
    if (sid) {
      expect(passive(generated, /^Passive Power:$/)).toEqual(passive(sid, /^Passive Power:$/));
      expect(passive(generated, /^Telco Passive:$/)).toEqual(passive(sid, /^Telco Passive:$/));
    }
  });

  it('LLD install rows and internal links equal the SID tables', () => {
    // The LLD covers R21C and R22C; the report keeps this site's links (12). The SID shows 11 of them:
    // it omits Te0/1/0/35 -> NASR3-R31C-C-EG Te0/2/0/10, which is in the LLD (see docs/report-vs-sid.md).
    const host = seed.siteData.hostname!;
    const ours = rowsWithHeader(generated, 'Parent Router').map((r) => r.join(' '));
    expect(ours).toEqual(seed.lld.internalLinks.filter((l) => l.parentRouter === host || l.childRouter === host).map((l) => [l.parentRouter, l.parentInterface, l.childRouter, l.childInterface, String(l.cost)].join(' ')));
    if (sid) {
      const theirs = rowsWithHeader(sid, 'Parent Router').map((r) => r.join(' '));
      expect(theirs.filter((x) => !ours.includes(x))).toEqual([]);
      expect(ours.filter((x) => !theirs.includes(x))).toEqual(['NASR3-R21C-C-EG Te0/1/0/35 NASR3-R31C-C-EG Te0/2/0/10 10']);
      const install = (c: DocxContent) => (c.tables.find((t) => t.rows[0]?.[0] === 'Hostname' && t.rows[0]?.[1] === 'Router Function')?.rows ?? []).slice(1).map((r) => r.slice(0, 3).join(' ').trim());
      expect(install(generated)).toEqual(install(sid));
    }
  });

  it('ODF utilization grids and fiber tests carry every source value (the SID embeds them as Excel objects)', () => {
    const cells = new Set(generated.tables.flatMap((t) => t.rows.flat()));
    for (const u of seed.utilization) for (const e of u.entries.filter((x) => x.port)) expect(cells.has(e.port!)).toBe(true);
    expect(generated.tables.filter((t) => t.rows[0]?.[0] === 'Fiber' && t.rows[0]?.[1] === 'A')).toHaveLength(seed.utilization.length);
    const fiberTables = generated.tables.filter((t) => t.rows[0]?.[0] === 'Panel' || t.rows[0]?.[0] === 'Fibers');
    expect(fiberTables).toHaveLength(seed.fiberTests.length);
    const values = fiberTables.flatMap((t) => t.rows.slice(1).flat()).filter((x) => /^-?\d+(\.\d+)?$/.test(x)).length;
    expect(values).toBeGreaterThanOrEqual(seed.fiberTests.reduce((a, t) => a + t.measurements.length, 0) - 50); // pair rows include fiber numbers
    expect(rowsWithHeader(generated, 'Router port')).toHaveLength(seed.portMap.length);
  });

  it('acceptance checklist lists the 58 SID items', () => {
    const t = generated.tables.find((x) => x.rows[0]?.join('|') === '#|Area|Status|Comments')!;
    expect(t.rows.filter((r) => /^[A-Z]\d+$/.test(r[0] ?? ''))).toHaveLength(58);
    expect(generatedXml.length).toBeGreaterThan(10_000);
  });
});
