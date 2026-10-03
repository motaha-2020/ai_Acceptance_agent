import { randomUUID } from 'node:crypto';
import {
  backoffDelay,
  DEFAULT_ATTEMPTS,
  DEFAULT_BACKOFF_MS,
  UnrecoverableJobError,
  type ConsumerOptions,
  type EnqueueOptions,
  type JobContext,
  type JobHandler,
  type JobQueue,
} from './port.js';

interface PendingJob {
  id: string;
  name: string;
  data: unknown;
  attempt: number;
  maxAttempts: number;
  backoffMs: number;
}

interface Consumer {
  handler: JobHandler<unknown>;
  opts: ConsumerOptions<unknown>;
  active: number;
}

/**
 * In-process queue with the same semantics as the BullMQ adapter (dedupe by jobId,
 * retries with exponential backoff, per-consumer concurrency). State is lost on restart:
 * for tests and single-process development only.
 */
export class InMemoryJobQueue implements JobQueue {
  readonly kind = 'memory' as const;
  private readonly waiting = new Map<string, PendingJob[]>();
  private readonly consumers = new Map<string, Consumer>();
  /** Ids of jobs that are waiting, delayed or active. */
  private readonly live = new Set<string>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly idleWaiters: (() => void)[] = [];
  private closed = false;

  constructor(private readonly opts: { backoffScale?: number } = {}) {}

  async enqueue<T>(name: string, data: T, opts: EnqueueOptions = {}): Promise<string> {
    if (this.closed) throw new Error('queue closed');
    const id = opts.jobId ?? randomUUID();
    if (this.live.has(id)) return id;
    this.live.add(id);
    const job: PendingJob = {
      id,
      name,
      data,
      attempt: 1,
      maxAttempts: opts.attempts ?? DEFAULT_ATTEMPTS,
      backoffMs: opts.backoffMs ?? DEFAULT_BACKOFF_MS,
    };
    if (opts.delayMs) this.later(opts.delayMs, () => this.push(job));
    else this.push(job);
    return id;
  }

  consume<T>(name: string, handler: JobHandler<T>, opts: ConsumerOptions<T>): void {
    if (this.consumers.has(name)) throw new Error(`consumer already registered for ${name}`);
    this.consumers.set(name, {
      handler: handler as JobHandler<unknown>,
      opts: opts as ConsumerOptions<unknown>,
      active: 0,
    });
    this.pump(name);
  }

  async ping(): Promise<void> {
    if (this.closed) throw new Error('queue closed');
  }

  /** Resolves when no job is waiting, delayed or running (tests). */
  async drain(): Promise<void> {
    if (this.live.size === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private push(job: PendingJob): void {
    const list = this.waiting.get(job.name) ?? [];
    list.push(job);
    this.waiting.set(job.name, list);
    this.pump(job.name);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.closed) fn();
    }, ms * (this.opts.backoffScale ?? 1));
    this.timers.add(t);
  }

  private pump(name: string): void {
    const consumer = this.consumers.get(name);
    const list = this.waiting.get(name);
    if (!consumer || !list || this.closed) return;
    while (consumer.active < consumer.opts.concurrency && list.length > 0) {
      const job = list.shift()!;
      consumer.active++;
      void this.run(consumer, job).finally(() => {
        consumer.active--;
        this.pump(name);
      });
    }
  }

  private async run(consumer: Consumer, job: PendingJob): Promise<void> {
    const ctx: JobContext<unknown> = { id: job.id, name: job.name, data: job.data, attempt: job.attempt, maxAttempts: job.maxAttempts };
    try {
      await consumer.handler(ctx);
      this.finish(job.id);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const final = error instanceof UnrecoverableJobError || job.attempt >= job.maxAttempts;
      try {
        await consumer.opts.onFailed?.(ctx, error, final);
      } catch {
        // failure hooks must not break the queue
      }
      if (final) this.finish(job.id);
      else this.later(backoffDelay(job.backoffMs, job.attempt), () => this.push({ ...job, attempt: job.attempt + 1 }));
    }
  }

  private finish(id: string): void {
    this.live.delete(id);
    if (this.live.size === 0) this.idleWaiters.splice(0).forEach((r) => r());
  }
}
