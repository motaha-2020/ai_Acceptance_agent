import { ProviderError } from './errors.js';

export interface RetryOptions {
  /** Total attempts including the first one. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** 0..1 random source for jitter; injected for tests. */
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: ProviderError }) => void;
}

export const DEFAULT_RETRY: RetryOptions = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 30_000 };

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter, honouring Retry-After when it is longer. */
export function backoffDelay(attempt: number, opts: RetryOptions, retryAfterMs?: number): number {
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (attempt - 1));
  const jittered = Math.round(exp * (0.5 + 0.5 * (opts.random ?? Math.random)()));
  return Math.min(opts.maxDelayMs, Math.max(jittered, retryAfterMs ?? 0));
}

/** Retries only ProviderErrors marked retryable (429, 5xx, timeout, network). */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = DEFAULT_RETRY): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!(err instanceof ProviderError) || !err.retryable || attempt >= opts.maxAttempts) throw err;
      const delayMs = backoffDelay(attempt, opts, err.retryAfterMs);
      opts.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
}
