import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@acceptance/db';
import { InMemoryJobQueue, JobName, type AnalyzePhotoJob, type JobContext } from '@acceptance/queue';
import type { AnalysisResult } from '@acceptance/shared';
import { LocalObjectStorage } from '@acceptance/storage';
import {
  AnalyzePhotoProcessor,
  DailyBudgetGuard,
  FakeAnalysisProvider,
  HumanReviewGate,
  PolicyAutonomyGate,
  ProviderRegistry,
  startAnalysisRuntime,
  type Logger,
} from '../src/index.js';

const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

let prisma: PrismaClient;
let storage: LocalObjectStorage;
let dir: string;
let fixture: { userId: string; siteId: string; visitId: string; submissionId: string };

const rejectWithSnags: AnalysisResult = {
  categoryMatches: true,
  qualityIssues: [],
  verdict: 'reject',
  confidence: 0.82,
  snags: [
    { code: 'PERSON_IN_FRAME', severity: 'major', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.5 }, reasonAr: 'ظهور شخص', reasonEn: 'Person visible' },
    { code: 'NOT_A_REAL_CODE', severity: 'minor', reasonAr: 'ملاحظة', reasonEn: 'Something odd' },
  ],
};

async function newPhoto(): Promise<string> {
  const key = `photos/test/${randomUUID()}`;
  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#808080' } }).jpeg().toBuffer();
  await storage.put(`${key}/web.jpg`, jpeg, { contentType: 'image/jpeg' });
  const photo = await prisma.photo.create({
    data: {
      clientUuid: randomUUID(),
      submissionId: fixture.submissionId,
      visitId: fixture.visitId,
      siteId: fixture.siteId,
      category: 'rack',
      sha256: randomUUID().replace(/-/g, ''),
      mimeType: 'image/jpeg',
      sizeBytes: jpeg.length,
      originalKey: `${key}/original.jpg`,
      webKey: `${key}/web.jpg`,
      thumbKey: `${key}/thumb.jpg`,
      uploadedById: fixture.userId,
    },
  });
  return photo.id;
}

function job(photoId: string, attempt = 1): JobContext<AnalyzePhotoJob> {
  return { id: `analyze:${photoId}`, name: JobName.analyzePhoto, data: { photoId, reason: 'upload' }, attempt, maxAttempts: 3 };
}

function processorWith(provider: FakeAnalysisProvider, budgetUsd = 0): AnalyzePhotoProcessor {
  return new AnalyzePhotoProcessor({
    prisma,
    storage,
    providers: new ProviderRegistry().register('fake', () => provider),
    providerName: 'fake',
    budget: new DailyBudgetGuard(prisma, budgetUsd),
    gate: new HumanReviewGate(),
    logger: silent,
  });
}

beforeAll(async () => {
  prisma = createPrismaClient(inject('databaseUrl'));
  dir = await mkdtemp(path.join(os.tmpdir(), 'worker-storage-'));
  storage = new LocalObjectStorage({ rootDir: dir, publicBaseUrl: 'http://x/files', signingSecret: 'k' });
  const role = await prisma.role.create({ data: { name: 'technician', description: 't' } });
  const user = await prisma.user.create({ data: { email: 'tech@example.com', name: 'Tech', passwordHash: 'x', roleId: role.id } });
  const project = await prisma.project.create({ data: { code: 'P1', name: 'P1' } });
  const site = await prisma.site.create({ data: { code: 's1', name: 'S1', projectId: project.id } });
  await prisma.device.create({ data: { siteId: site.id, model: 'ASR-9906', hostname: 'H1' } });
  const visit = await prisma.visit.create({ data: { siteId: site.id, title: 'v', createdById: user.id } });
  const submission = await prisma.submission.create({ data: { visitId: visit.id, category: 'rack' } });
  fixture = { userId: user.id, siteId: site.id, visitId: visit.id, submissionId: submission.id };
});

afterAll(async () => {
  await prisma?.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

describe('AnalyzePhotoProcessor', () => {
  it('persists the analysis and AI snags and sends the photo to human review', async () => {
    const provider = new FakeAnalysisProvider((req) => {
      expect(req.category).toBe('rack');
      expect(req.context).toEqual({ deviceModel: 'ASR-9906', hostname: 'H1' });
      expect(req.image.data.byteLength).toBeGreaterThan(0);
      return rejectWithSnags;
    });
    const photoId = await newPhoto();
    await processorWith(provider).handle(job(photoId));

    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId }, include: { analyses: true, snags: true } });
    expect(photo.status).toBe('pending_review');
    expect(photo.analyses).toHaveLength(1);
    expect(photo.analyses[0]).toMatchObject({ status: 'succeeded', provider: 'fake', verdict: 'reject', confidence: 0.82, inputTokens: 1000 });
    expect(Number(photo.analyses[0]?.costUsd)).toBeCloseTo(0.001);
    const codes = photo.snags.map((s) => s.code).sort();
    expect(codes).toEqual(['OTHER_SNAG', 'PERSON_IN_FRAME']);
    expect(photo.snags.every((s) => s.source === 'ai' && s.status === 'open')).toBe(true);
    expect(photo.snags.find((s) => s.code === 'OTHER_SNAG')?.textEn).toBe('[NOT_A_REAL_CODE] Something odd');

    // Idempotent: a second run does nothing.
    await processorWith(provider).handle(job(photoId));
    expect(await prisma.analysis.count({ where: { photoId } })).toBe(1);
    expect(provider.calls).toBe(1);
  });

  it('records invalid provider output as a failed analysis and lets the queue retry', async () => {
    const provider = new FakeAnalysisProvider(() => ({ verdict: 'maybe' }) as unknown as AnalysisResult);
    const photoId = await newPhoto();
    const processor = processorWith(provider);
    await expect(processor.handle(job(photoId))).rejects.toThrow(/invalid AnalysisResult/);
    const failed = await prisma.analysis.findFirstOrThrow({ where: { photoId } });
    expect(failed.status).toBe('failed');
    expect(failed.raw).toEqual({ verdict: 'maybe' });
    expect((await prisma.photo.findUniqueOrThrow({ where: { id: photoId } })).status).toBe('uploaded');

    await processor.onFailed(job(photoId, 3), new Error('x'), true);
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.status).toBe('pending_review');
    expect(photo.aiSkipReason).toBe('analysis_failed');
  });

  it('skips AI when the daily budget is spent but still routes the photo to a human', async () => {
    const provider = new FakeAnalysisProvider();
    const photoId = await newPhoto();
    await processorWith(provider, 0.0001).handle(job(photoId)); // earlier tests already spent 0.001
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.status).toBe('pending_review');
    expect(photo.aiSkipReason).toBe('budget_exceeded');
    expect(provider.calls).toBe(0);
  });

  it('retries transient provider errors through the queue', async () => {
    let calls = 0;
    const provider = new FakeAnalysisProvider(() => {
      calls++;
      if (calls === 1) throw new Error('503 overloaded');
      return { categoryMatches: true, qualityIssues: [], verdict: 'accept', confidence: 0.95, snags: [] };
    });
    const queue = new InMemoryJobQueue({ backoffScale: 0.001 });
    startAnalysisRuntime({
      prisma,
      storage,
      queue,
      logger: silent,
      env: { AI_PROVIDER: 'fake', AI_CONCURRENCY: 2, AI_MAX_ATTEMPTS: 3, AI_DAILY_BUDGET_USD: 0, AUTONOMY_ENABLED: false },
      providers: new ProviderRegistry().register('fake', () => provider),
    });
    const photoId = await newPhoto();
    await queue.enqueue(JobName.analyzePhoto, { photoId, reason: 'upload' }, { jobId: `analyze:${photoId}`, attempts: 3, backoffMs: 10 });
    await queue.drain();
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId }, include: { analyses: { orderBy: { createdAt: 'asc' } } } });
    expect(photo.status).toBe('pending_review');
    expect(photo.analyses.map((a) => a.status)).toEqual(['failed', 'succeeded']);
    expect(photo.analyses[1]?.attempt).toBe(2);
    await queue.close();
  });
});

describe('autonomy gates', () => {
  const clean: AnalysisResult = { categoryMatches: true, qualityIssues: [], verdict: 'accept', confidence: 0.99, snags: [] };

  it('Phase 1 gate always sends photos to a human', async () => {
    expect((await new HumanReviewGate().decide()).decision).toBe('pending_review');
  });

  it('policy gate stays closed while the category policy is disabled or under-sampled', async () => {
    const gate = new PolicyAutonomyGate(prisma);
    expect(await gate.decide({ category: 'rack', result: clean })).toEqual({ decision: 'pending_review', reason: 'policy_disabled' });
    await prisma.autonomyPolicy.create({ data: { category: 'rack', enabled: true, minSamples: 1, minAgreement: 0.9 } });
    expect((await gate.decide({ category: 'rack', result: { ...clean, verdict: 'uncertain' } })).reason).toBe('not_clean_accept');
    expect((await gate.decide({ category: 'rack', result: { ...clean, confidence: 0.5 } })).reason).toBe('low_confidence');
    expect((await gate.decide({ category: 'rack', result: clean })).reason).toBe('not_enough_samples');
  });
});
