import { getSnag } from '@acceptance/checklist';
import { Prisma, type PrismaClient } from '@acceptance/db';
import { JobName, UnrecoverableJobError, type AnalyzePhotoJob, type JobContext, type JobQueue } from '@acceptance/queue';
import { AnalysisResult, type AnalysisMeta, type PhotoCategory, type SnagFinding } from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import type { AutonomyGate, BudgetGuard } from './guards.js';
import type { ProviderRegistry } from './providers.js';

/** Minimal structured logger (pino-compatible). */
export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
}

export interface AnalyzePhotoDeps {
  prisma: PrismaClient;
  storage: ObjectStorage;
  providers: ProviderRegistry;
  providerName: string;
  budget: BudgetGuard;
  gate: AutonomyGate;
  logger: Logger;
}

/** Code used when a provider returns a code that is not in the taxonomy. */
export const FALLBACK_SNAG_CODE = 'OTHER_SNAG';

export class InvalidProviderResultError extends Error {
  constructor(readonly issues: string) {
    super(`provider returned an invalid AnalysisResult: ${issues}`);
    this.name = 'InvalidProviderResultError';
  }
}

/**
 * `analyze-photo` job: load the web variant, call the configured AnalysisProvider, validate the
 * result, persist Analysis + AI snags and move the photo uploaded -> ai_analyzed -> pending_review
 * (or approved when the autonomy gate allows it, Phase 2).
 *
 * Idempotent: a photo that is no longer `uploaded` is skipped, and the status change is a
 * compare-and-set so two concurrent runs cannot both persist results.
 */
export class AnalyzePhotoProcessor {
  constructor(private readonly deps: AnalyzePhotoDeps) {}

  async handle(job: JobContext<AnalyzePhotoJob>): Promise<void> {
    const { prisma, storage, logger } = this.deps;
    const photoId = job.data.photoId;
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { site: { include: { devices: { orderBy: { createdAt: 'asc' }, take: 1 } } } },
    });
    if (!photo) throw new UnrecoverableJobError(`photo ${photoId} not found`);
    if (photo.status !== 'uploaded') {
      logger.info({ photoId, status: photo.status }, 'analyze-photo: photo already processed, skipping');
      return;
    }

    const budget = await this.deps.budget.check();
    if (!budget.ok) {
      logger.warn({ photoId, ...budget }, 'analyze-photo: daily AI budget exhausted, sending photo to human review without AI');
      await this.skipAi(photoId, 'budget_exceeded');
      return;
    }

    const provider = this.deps.providers.get(this.deps.providerName);
    const image = await storage.get(photo.webKey);
    const device = photo.site.devices[0];
    const started = Date.now();
    let output: { result: unknown; meta: AnalysisMeta };
    try {
      output = await provider.analyze({
        image: { data: new Uint8Array(image), mediaType: 'image/jpeg' },
        category: photo.category as PhotoCategory,
        context: { deviceModel: device?.model, hostname: device?.hostname ?? undefined },
      });
    } catch (err) {
      await this.recordFailure(photoId, job.attempt, { provider: provider.name, model: 'unknown', promptVersion: 'unknown', latencyMs: Date.now() - started }, err, null);
      throw err;
    }

    const parsed = AnalysisResult.safeParse(output.result);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      await this.recordFailure(photoId, job.attempt, output.meta, new InvalidProviderResultError(issues), output.result);
      throw new InvalidProviderResultError(issues);
    }
    const result = parsed.data;
    const meta = output.meta;

    const persisted = await prisma.$transaction(async (tx) => {
      const claimed = await tx.photo.updateMany({ where: { id: photoId, status: 'uploaded' }, data: { status: 'ai_analyzed', aiSkipReason: null } });
      if (claimed.count === 0) return null;
      const analysis = await tx.analysis.create({
        data: {
          photoId,
          status: 'succeeded',
          provider: meta.provider,
          model: meta.model,
          promptVersion: meta.promptVersion,
          verdict: result.verdict,
          confidence: result.confidence,
          categoryMatches: result.categoryMatches,
          detectedCategory: result.detectedCategory ?? null,
          qualityIssues: result.qualityIssues,
          inputTokens: meta.inputTokens ?? null,
          outputTokens: meta.outputTokens ?? null,
          costUsd: meta.costUsd !== undefined ? new Prisma.Decimal(meta.costUsd) : null,
          latencyMs: Math.round(meta.latencyMs),
          attempt: job.attempt,
          raw: result as unknown as Prisma.InputJsonValue,
        },
      });
      if (result.snags.length > 0) {
        await tx.snag.createMany({ data: result.snags.map((s) => toSnagRow(s, photoId, analysis.id)) });
      }
      return analysis;
    });
    if (!persisted) {
      logger.info({ photoId }, 'analyze-photo: lost race with a concurrent run, skipping');
      return;
    }

    const gate = await this.deps.gate.decide({ category: photo.category as PhotoCategory, result });
    await prisma.photo.updateMany({
      where: { id: photoId, status: 'ai_analyzed' },
      data: gate.decision === 'approved' ? { status: 'approved', decidedAt: new Date() } : { status: 'pending_review' },
    });
    logger.info(
      { photoId, analysisId: persisted.id, verdict: result.verdict, snags: result.snags.length, costUsd: meta.costUsd, gate: gate.reason },
      'analyze-photo: done',
    );
  }

  /** Queue failure hook: after the last attempt the photo still goes to a human. */
  async onFailed(job: JobContext<AnalyzePhotoJob>, error: Error, final: boolean): Promise<void> {
    this.deps.logger.warn({ photoId: job.data.photoId, attempt: job.attempt, final, err: error.message }, 'analyze-photo: attempt failed');
    if (final) await this.skipAi(job.data.photoId, 'analysis_failed');
  }

  private async skipAi(photoId: string, reason: string): Promise<void> {
    await this.deps.prisma.photo.updateMany({ where: { id: photoId, status: 'uploaded' }, data: { status: 'pending_review', aiSkipReason: reason } });
  }

  private async recordFailure(photoId: string, attempt: number, meta: AnalysisMeta, err: unknown, raw: unknown): Promise<void> {
    try {
      await this.deps.prisma.analysis.create({
        data: {
          photoId,
          status: 'failed',
          provider: meta.provider,
          model: meta.model,
          promptVersion: meta.promptVersion,
          latencyMs: Math.round(meta.latencyMs),
          inputTokens: meta.inputTokens ?? null,
          outputTokens: meta.outputTokens ?? null,
          costUsd: meta.costUsd !== undefined ? new Prisma.Decimal(meta.costUsd) : null,
          attempt,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
          raw: raw === null || raw === undefined ? Prisma.JsonNull : (raw as Prisma.InputJsonValue),
        },
      });
    } catch (e) {
      this.deps.logger.error({ photoId, err: (e as Error).message }, 'analyze-photo: could not record failed analysis');
    }
  }
}

export function toSnagRow(s: SnagFinding, photoId: string, analysisId: string): Prisma.SnagCreateManyInput {
  const known = getSnag(s.code);
  const code = known ? s.code : FALLBACK_SNAG_CODE;
  const unknownPrefix = known ? '' : `[${s.code}] `;
  return {
    photoId,
    analysisId,
    code,
    severity: s.severity,
    bbox: s.bbox ? (s.bbox as Prisma.InputJsonValue) : Prisma.JsonNull,
    textAr: s.reasonAr,
    textEn: unknownPrefix + s.reasonEn,
    source: 'ai',
  };
}

export interface WorkerOptions {
  concurrency: number;
  attempts?: number;
}

/** Register the analyze-photo consumer on a queue (standalone worker or embedded in the API). */
export function startAnalysisWorker(queue: JobQueue, processor: AnalyzePhotoProcessor, opts: WorkerOptions): void {
  queue.consume<AnalyzePhotoJob>(JobName.analyzePhoto, (job) => processor.handle(job), {
    concurrency: opts.concurrency,
    onFailed: (job, err, final) => processor.onFailed(job, err, final),
  });
}
