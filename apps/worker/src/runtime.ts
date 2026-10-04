import { z } from 'zod';
import type { PrismaClient } from '@acceptance/db';
import type { JobQueue } from '@acceptance/queue';
import type { ObjectStorage } from '@acceptance/storage';
import { ClassifyPhotoProcessor, FakeCategoryClassifier, startClassifyWorker, type CategoryClassifierPort } from './classify.js';
import { DailyBudgetGuard, HumanReviewGate, PolicyAutonomyGate, type AutonomyGate, type BudgetGuard } from './guards.js';
import { AnalyzePhotoProcessor, startAnalysisWorker, type Logger } from './processor.js';
import { FakeAnalysisProvider, ProviderRegistry } from './providers.js';

/** Worker-specific settings (shared by the standalone worker and the API's embedded worker). */
export const WorkerEnv = z.object({
  AI_PROVIDER: z.string().min(1).default('fake'),
  /** Optional model override for a single real provider (e.g. claude-sonnet-5-5). */
  AI_MODEL: z.string().optional(),
  AI_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  /** USD per UTC day; 0 disables the guard. */
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(20),
  /** Phase 2 switch. Phase 1 keeps this false: every photo goes to a human. */
  AUTONOMY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type WorkerEnv = z.infer<typeof WorkerEnv>;

/**
 * Provider registry for the configured environment. `fake` is always available (dev/tests).
 * Composition roots add real vendors via `extra`, e.g.
 *   (r) => r.register('claude', () => createProvider('claude')) // @acceptance/ai
 */
export function buildProviderRegistry(extra?: (registry: ProviderRegistry) => void): ProviderRegistry {
  const registry = new ProviderRegistry().register('fake', () => new FakeAnalysisProvider());
  extra?.(registry);
  return registry;
}

export interface AnalysisRuntimeDeps {
  prisma: PrismaClient;
  storage: ObjectStorage;
  queue: JobQueue;
  logger: Logger;
  env: WorkerEnv;
  providers?: ProviderRegistry;
  budget?: BudgetGuard;
  gate?: AutonomyGate;
  /** Bulk-upload category proposals (ADR 0005); default: a fake that keeps the uploader's guess. */
  classifier?: CategoryClassifierPort;
}

/** Wire the processor and register the queue consumer. Returns the processor (for tests). */
export function startAnalysisRuntime(deps: AnalysisRuntimeDeps): AnalyzePhotoProcessor {
  const providers = deps.providers ?? buildProviderRegistry();
  if (!providers.has(deps.env.AI_PROVIDER)) {
    throw new Error(`AI_PROVIDER="${deps.env.AI_PROVIDER}" is not registered (known: ${providers.names().join(', ')})`);
  }
  const budget = deps.budget ?? new DailyBudgetGuard(deps.prisma, deps.env.AI_DAILY_BUDGET_USD);
  const processor = new AnalyzePhotoProcessor({
    prisma: deps.prisma,
    storage: deps.storage,
    providers,
    providerName: deps.env.AI_PROVIDER,
    budget,
    gate: deps.gate ?? (deps.env.AUTONOMY_ENABLED ? new PolicyAutonomyGate(deps.prisma) : new HumanReviewGate()),
    logger: deps.logger,
  });
  startAnalysisWorker(deps.queue, processor, { concurrency: deps.env.AI_CONCURRENCY, attempts: deps.env.AI_MAX_ATTEMPTS });
  const classify = new ClassifyPhotoProcessor({ prisma: deps.prisma, storage: deps.storage, classifier: deps.classifier ?? new FakeCategoryClassifier(), budget, logger: deps.logger, queue: deps.queue, analysisAttempts: deps.env.AI_MAX_ATTEMPTS });
  startClassifyWorker(deps.queue, classify, { concurrency: deps.env.AI_CONCURRENCY });
  deps.logger.info({ provider: deps.env.AI_PROVIDER, concurrency: deps.env.AI_CONCURRENCY, queue: deps.queue.kind }, 'analysis worker started');
  return processor;
}
