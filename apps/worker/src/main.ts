import { writeFile } from 'node:fs/promises';
import { pino } from 'pino';
import { z } from 'zod';
import { createPrismaClient } from '@acceptance/db';
import { createJobQueue } from '@acceptance/queue';
import { createObjectStorage } from '@acceptance/storage';
import { registerAiProviders } from './ai-providers.js';
import { startReportRuntime } from './reports/processor.js';
import { buildProviderRegistry, startAnalysisRuntime, WorkerEnv } from './runtime.js';

/** Standalone worker process (production: BullMQ/Redis). */
const Env = WorkerEnv.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  QUEUE_PREFIX: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('s3'),
  STORAGE_LOCAL_DIR: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().optional(),
  STORAGE_SIGNING_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  /** When set, the worker touches this file every 15 s while Redis and PostgreSQL answer (container healthcheck). */
  WORKER_HEARTBEAT_FILE: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.AI_PROVIDER === 'fake') {
    ctx.addIssue({ code: 'custom', path: ['AI_PROVIDER'], message: 'the fake provider is not allowed in production' });
  }
});

async function main(): Promise<void> {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid worker configuration:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
    process.exit(1);
  }
  const env = parsed.data;
  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'worker' } });
  const prisma = createPrismaClient(env.DATABASE_URL);
  const queue = createJobQueue(env);
  const storage = createObjectStorage(env);
  const providers = buildProviderRegistry((r) => registerAiProviders(r, env));
  if (providers.has(env.AI_PROVIDER)) providers.get(env.AI_PROVIDER); // fail fast on a missing API key
  startAnalysisRuntime({ prisma, storage, queue, logger, env, providers });
  startReportRuntime({ prisma, storage, queue, logger });

  // Liveness for the container healthcheck: touch a file only while the queue and DB answer.
  let heartbeat: NodeJS.Timeout | undefined;
  if (env.WORKER_HEARTBEAT_FILE) {
    const file = env.WORKER_HEARTBEAT_FILE;
    const beat = async (): Promise<void> => {
      try {
        await queue.ping();
        await prisma.$queryRaw`SELECT 1`;
        await writeFile(file, String(Date.now()));
      } catch (err) {
        logger.warn({ err }, 'worker heartbeat failed');
      }
    };
    void beat();
    heartbeat = setInterval(() => void beat(), 15_000);
  }

  const shutdown = async (signal: string): Promise<void> => {
    if (heartbeat) clearInterval(heartbeat);
    logger.info({ signal }, 'worker shutting down');
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
