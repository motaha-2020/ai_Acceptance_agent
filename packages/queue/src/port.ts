/**
 * Job queue port. Adapters: BullMQ/Redis (production, separate worker process) and an
 * in-process queue (tests and dev without Redis; the worker runs inside the API process).
 */
export interface EnqueueOptions {
  /** Deduplication id: a job with the same id that is still waiting/active is not added twice. */
  jobId?: string;
  /** Total attempts including the first one. Default 3. */
  attempts?: number;
  /** Base delay for exponential backoff (delay = backoffMs * 2^(attempt-1)). Default 5000. */
  backoffMs?: number;
  /** Delay before the first attempt. */
  delayMs?: number;
}

export interface JobContext<T> {
  id: string;
  name: string;
  data: T;
  /** 1-based attempt number. */
  attempt: number;
  maxAttempts: number;
}

export type JobHandler<T> = (job: JobContext<T>) => Promise<void>;

export interface ConsumerOptions<T> {
  concurrency: number;
  /** Called on every failed attempt; `final` is true when no retry will follow. */
  onFailed?: (job: JobContext<T>, error: Error, final: boolean) => Promise<void> | void;
}

export interface JobQueue {
  readonly kind: 'memory' | 'bullmq';
  enqueue<T>(name: string, data: T, opts?: EnqueueOptions): Promise<string>;
  /** Register the consumer for a job name (one per name per process). */
  consume<T>(name: string, handler: JobHandler<T>, opts: ConsumerOptions<T>): void;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Throw from a handler to fail the job without further retries. */
export class UnrecoverableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecoverableJobError';
  }
}

export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_MS = 5000;

export function backoffDelay(baseMs: number, attempt: number): number {
  return baseMs * 2 ** Math.max(0, attempt - 1);
}
