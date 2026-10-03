/** Retry policy of the upload queue: what an outcome means and when to try again. */

export type RemoteOutcome<T = undefined> =
  | { kind: 'ok'; value: T }
  /** No response at all (offline, DNS, timeout, connection reset). */
  | { kind: 'network'; message: string }
  /** Access token expired and could not be refreshed: the user must log in again. */
  | { kind: 'auth'; message: string }
  | { kind: 'http'; status: number; code?: string; message: string };

export type Decision = 'success' | 'retry' | 'auth' | 'permanent';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function classify(outcome: RemoteOutcome<unknown>): Decision {
  switch (outcome.kind) {
    case 'ok':
      return 'success';
    case 'network':
      return 'retry';
    case 'auth':
      return 'auth';
    case 'http':
      if (outcome.status === 401) return 'auth';
      if (RETRYABLE_STATUS.has(outcome.status) || outcome.status >= 500) return 'retry';
      return 'permanent';
  }
}

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 5_000, maxMs: 30 * 60_000 };

/**
 * Exponential backoff with "equal jitter": half fixed, half random, so a fleet of phones coming
 * back online at once does not hammer the server in lock-step.
 * attempts = failures so far (0 for the first retry).
 */
export function backoffDelay(attempts: number, random: () => number = Math.random, opts: BackoffOptions = DEFAULT_BACKOFF): number {
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.min(attempts, 30));
  const half = exp / 2;
  return Math.round(half + random() * half);
}

export function describe(outcome: RemoteOutcome<unknown>): string {
  switch (outcome.kind) {
    case 'ok':
      return 'ok';
    case 'network':
    case 'auth':
      return `${outcome.kind}: ${outcome.message}`;
    case 'http':
      return `HTTP ${outcome.status}${outcome.code ? ` ${outcome.code}` : ''}: ${outcome.message}`;
  }
}
