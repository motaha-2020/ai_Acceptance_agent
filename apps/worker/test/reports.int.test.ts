import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, seedDatabase, type PrismaClient } from '@acceptance/db';
import { startTestDatabase, type TestDatabase } from '@acceptance/db/testing';
import { InMemoryJobQueue, JobName, type GenerateReportJob, type JobContext } from '@acceptance/queue';
import { LocalObjectStorage, type ObjectStorage } from '@acceptance/storage';
import { GenerateReportProcessor, startReportRuntime, type Logger, type PdfConverter } from '../src/index.js';

const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

let db: TestDatabase;
let prisma: PrismaClient;
let storage: LocalObjectStorage;
let dir: string;
let ids: { userId: string; siteId: string };

async function addPhoto(category: 'rack' | 'patch_cords', status: 'approved' | 'pending_review', visitId: string): Promise<string> {
  const submission = await prisma.submission.upsert({ where: { visitId_category: { visitId, category } }, update: {}, create: { visitId, category } });
  const key = `photos/test/${randomUUID()}`;
  const jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#4a6' } }).jpeg().toBuffer();
  await storage.put(`${key}/web.jpg`, jpeg, { contentType: 'image/jpeg' });
  const p = await prisma.photo.create({
    data: {
      clientUuid: randomUUID(), submissionId: submission.id, visitId, siteId: ids.siteId, category, status,
      sha256: randomUUID(), mimeType: 'image/jpeg', sizeBytes: jpeg.length, originalKey: `${key}/o.jpg`, webKey: `${key}/web.jpg`, thumbKey: `${key}/t.jpg`,
      uploadedById: ids.userId, capturedAt: new Date('2026-01-20T10:32:00Z'),
    },
  });
  return p.id;
}

async function newReport(draft = true): Promise<string> {
  const version = (await prisma.report.count({ where: { siteId: ids.siteId } })) + 1;
  return (await prisma.report.create({ data: { siteId: ids.siteId, version, draft, createdById: ids.userId } })).id;
}

const job = (reportId: string): JobContext<GenerateReportJob> => ({ id: `report-${reportId}`, name: JobName.generateReport, data: { reportId }, attempt: 1, maxAttempts: 1 });
const processor = (pdf: PdfConverter, s: ObjectStorage = storage) => new GenerateReportProcessor({ prisma, storage: s, logger: silent, pdf });

beforeAll(async () => {
  db = await startTestDatabase('reports_test');
  prisma = createPrismaClient(db.url);
  const seed = await seedDatabase(prisma, { adminEmail: 'admin@example.com', adminPassword: 'admin-password-1' });
  dir = await mkdtemp(path.join(os.tmpdir(), 'report-storage-'));
  storage = new LocalObjectStorage({ rootDir: dir, publicBaseUrl: 'http://x/files', signingSecret: 'k' });
  const site = await prisma.site.create({ data: { code: 'r-site', name: 'Report Site', projectId: seed.projectId, region: 'Cairo' } });
  await prisma.device.create({ data: { siteId: site.id, model: 'ASR-9906', hostname: 'RPT-HOST', serial: 'CH1' } });
  await prisma.siteTechnicalData.create({ data: { siteId: site.id, survey: { V1: { value: '3 Good' } }, fiberTests: [{ odf: 1, layout: 'panel_by_fiber', measurements: [{ panel: 'A', fibers: [1], direction: null, lossDb: 0.3 }], summary: { count: 1, minDb: 0.3, maxDb: 0.3, meanDb: 0.3 } }] } });
  ids = { userId: seed.adminUserId, siteId: site.id };
  const visit = await prisma.visit.create({ data: { siteId: site.id, title: 'install', createdById: seed.adminUserId } });
  const ok = await addPhoto('rack', 'approved', visit.id);
  await addPhoto('rack', 'approved', visit.id);
  await addPhoto('patch_cords', 'pending_review', visit.id);
  await prisma.snag.create({ data: { photoId: ok, code: 'RACK_DOOR_NOT_CLOSED', severity: 'minor', textAr: 'باب', textEn: 'door', source: 'human', status: 'verified' } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await db?.stop();
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

describe('GenerateReportProcessor', () => {
  it('builds the DOCX from DB data, stores it and marks the report ready (no LibreOffice -> warning)', async () => {
    const id = await newReport();
    await processor(null).handle(job(id));
    const r = await prisma.report.findUniqueOrThrow({ where: { id } });
    expect(r).toMatchObject({ status: 'ready', pdfKey: null, error: null });
    expect(r.docxKey).toBe(`reports/${ids.siteId}/${id}/SID-RPT-HOST-v1-DRAFT.docx`);
    expect(r.warnings).toContain('PDF not generated: LibreOffice (soffice) is not installed on the worker');
    expect(r.meta).toMatchObject({ galleryPhotos: 2, bomSource: 'none', checklist: { manual: 1 } });
    expect(r.startedAt).not.toBeNull();

    const docx = await storage.get(r.docxKey!);
    expect(r.docxBytes).toBe(docx.length);
    const zip = await JSZip.loadAsync(docx);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/<a:blip /g)).toHaveLength(2); // only the approved photos
    expect(xml).toContain('RPT-HOST');
    // gallery images are recompressed to <= 1280 px
    const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/') && !f.endsWith('/'));
    const meta = await sharp(await zip.file(media[0]!)!.async('nodebuffer')).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1280);
  });

  it('stores the PDF when a converter is available and keeps going when it fails', async () => {
    const id = await newReport(false);
    await processor(async () => Buffer.from('%PDF-1.7 fake')).handle(job(id));
    const r = await prisma.report.findUniqueOrThrow({ where: { id } });
    expect(r.pdfKey).toMatch(/SID-RPT-HOST-v\d+\.pdf$/);
    expect((await storage.get(r.pdfKey!)).toString()).toContain('%PDF');

    const id2 = await newReport();
    await processor(async () => { throw new Error('boom'); }).handle(job(id2));
    const r2 = await prisma.report.findUniqueOrThrow({ where: { id: id2 } });
    expect(r2.status).toBe('ready');
    expect(r2.warnings).toContain('PDF not generated: boom');
  });

  it('runs through the queue and marks the report failed after the last attempt', async () => {
    const queue = new InMemoryJobQueue({ backoffScale: 0.001 });
    const broken: ObjectStorage = Object.assign(Object.create(storage) as LocalObjectStorage, { put: async () => { throw new Error('disk full'); } });
    startReportRuntime({ prisma, storage: broken, queue, logger: silent, pdf: null });
    const id = await newReport();
    await queue.enqueue(JobName.generateReport, { reportId: id }, { attempts: 2, backoffMs: 1 });
    await queue.drain();
    const r = await prisma.report.findUniqueOrThrow({ where: { id } });
    expect(r).toMatchObject({ status: 'failed', error: 'disk full' });
    await queue.close();
  });

  it('skips reports that are already ready', async () => {
    const id = await newReport();
    await prisma.report.update({ where: { id }, data: { status: 'ready', docxKey: 'x' } });
    await processor(null).handle(job(id));
    expect((await prisma.report.findUniqueOrThrow({ where: { id } })).docxKey).toBe('x');
  });
});
