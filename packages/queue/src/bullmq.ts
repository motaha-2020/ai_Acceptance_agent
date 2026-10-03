import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_BACKOFF_MS,
  UnrecoverableJobError,
  type ConsumerOptions,
  type EnqueueOptions,
  type JobContext,
  type JobHandler,
  type JobQueue,
} from './port.js';

export interface BullMqOptions {
  redisUrl: string;
  /** Key prefix, lets several environments share one Redis. */
  prefix?: string;
}

/** BullMQ/Redis adapter (production). Enqueue from the API, consume in apps/worker. */
export class BullMqJobQueue implements JobQueue {
  readonly kind = 'bullmq' as const;
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor(private readonly opts: BullMqOptions) {
    // BullMQ requires maxRetriesPerRequest=null for blocking connections.
    this.connection = new Redis(opts.redisUrl, { maxRetriesPerRequest: null });
  }

  private queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection, prefix: this.opts.prefix });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue<T>(name: string, data: T, opts: EnqueueOptions = {}): Promise<string> {
    const job = await this.queue(name).add(name, data, {
      jobId: opts.jobId,
      attempts: opts.attempts ?? DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: opts.backoffMs ?? DEFAULT_BACKOFF_MS },
      delay: opts.delayMs,
      removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    });
    return job.id ?? opts.jobId ?? '';
  }

  consume<T>(name: string, handler: JobHandler<T>, opts: ConsumerOptions<T>): void {
    const toCtx = (job: Job<T>): JobContext<T> => ({
      id: job.id ?? '',
      name: job.name,
      data: job.data,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
    });
    const worker = new Worker<T>(
      name,
      async (job) => {
        try {
          await handler(toCtx(job));
        } catch (err) {
          if (err instanceof UnrecoverableJobError) throw new UnrecoverableError(err.message);
          throw err;
        }
      },
      { connection: this.connection.duplicate(), concurrency: opts.concurrency, prefix: this.opts.prefix },
    );
    worker.on('failed', (job, err) => {
      if (!job || !opts.onFailed) return;
      const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
      // attemptsMade already counts this attempt when 'failed' fires.
      const ctx = { ...toCtx(job), attempt: job.attemptsMade };
      void Promise.resolve(opts.onFailed(ctx, err, final)).catch(() => undefined);
    });
    this.workers.push(worker);
  }

  async ping(): Promise<void> {
    const res = await this.connection.ping();
    if (res !== 'PONG') throw new Error(`redis ping returned ${res}`);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}
