import { pino } from 'pino';
import { z } from 'zod';
import { createPrismaClient } from '@acceptance/db';
import { createJobQueue } from '@acceptance/queue';
import { createObjectStorage } from '@acceptance/storage';
import { startAnalysisRuntime, WorkerEnv } from './runtime.js';

/** Standalone worker process (production: BullMQ/Redis). */
const Env = WorkerEnv.extend({
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
  startAnalysisRuntime({ prisma, storage, queue, logger, env });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker shutting down');
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
