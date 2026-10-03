import type { PrismaClient } from '@acceptance/db';
import { JobName, UnrecoverableJobError, type ClassifyPhotoJob, type JobContext, type JobQueue } from '@acceptance/queue';
import { PhotoCategory } from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import type { BudgetGuard } from './guards.js';
import type { Logger } from './processor.js';

/** What the worker needs from a category classifier (the @acceptance/ai CategoryClassifier satisfies it). */
export interface CategoryClassifierPort {
  classify(image: Uint8Array, hint?: string): Promise<{ guess: { category: PhotoCategory; confidence: number; alternative?: PhotoCategory }; meta: { costUsd?: number } }>;
}

/** Dev/test classifier: keeps the uploader's guess, unsure. */
export class FakeCategoryClassifier implements CategoryClassifierPort {
  calls = 0;
  constructor(private readonly respond?: (hint?: string) => { category: PhotoCategory; confidence: number; alternative?: PhotoCategory }) {}

  async classify(_image: Uint8Array, hint?: string) {
    this.calls++;
    return { guess: this.respond?.(hint) ?? { category: 'rack' as const, confidence: 0.5 }, meta: { costUsd: 0 } };
  }
}

export interface ClassifyPhotoDeps {
  prisma: PrismaClient;
  storage: ObjectStorage;
  classifier: CategoryClassifierPort;
  budget: BudgetGuard;
  logger: Logger;
}

/**
 * `classify-photo` job (ADR 0005): propose a category for a bulk-uploaded photo. The photo moves
 * classifying -> proposed with or without a proposal (budget exhausted / classifier failed = the uploader
 * picks the category by hand); it is never analysed here.
 */
export class ClassifyPhotoProcessor {
  constructor(private readonly deps: ClassifyPhotoDeps) {}

  async handle(job: JobContext<ClassifyPhotoJob>): Promise<void> {
    const { prisma, storage, logger } = this.deps;
    const photoId = job.data.photoId;
    const photo = await prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new UnrecoverableJobError(`photo ${photoId} not found`);
    if (photo.categoryState !== 'classifying') {
      logger.info({ photoId, categoryState: photo.categoryState }, 'classify-photo: not awaiting classification, skipping');
      return;
    }
    const budget = await this.deps.budget.check();
    if (!budget.ok) {
      logger.warn({ photoId, ...budget }, 'classify-photo: daily AI budget exhausted, leaving the category to the uploader');
      await this.propose(photoId, null);
      return;
    }
    const image = await storage.get(photo.webKey);
    const { guess } = await this.deps.classifier.classify(new Uint8Array(image), photo.fileName ?? undefined);
    await this.propose(photoId, guess);
  }

  /** Final failure: stop waiting for the AI, the uploader chooses. */
  async onFailed(job: JobContext<ClassifyPhotoJob>, err: Error, final: boolean): Promise<void> {
    this.deps.logger.warn({ photoId: job.data.photoId, attempt: job.attempt, final, err: err.message }, 'classify-photo failed');
    if (final) await this.propose(job.data.photoId, null);
  }

  private async propose(photoId: string, guess: { category: PhotoCategory; confidence: number; alternative?: PhotoCategory } | null): Promise<void> {
    await this.deps.prisma.photo.updateMany({
      where: { id: photoId, categoryState: 'classifying' },
      data: {
        categoryState: 'proposed',
        proposedCategory: guess?.category ?? null,
        proposedAlternative: guess?.alternative ?? null,
        categoryConfidence: guess?.confidence ?? null,
      },
    });
  }
}

export function startClassifyWorker(queue: JobQueue, processor: ClassifyPhotoProcessor, opts: { concurrency: number }): void {
  queue.consume<ClassifyPhotoJob>(JobName.classifyPhoto, (job) => processor.handle(job), {
    concurrency: opts.concurrency,
    onFailed: (job, err, final) => processor.onFailed(job, err, final),
  });
}
