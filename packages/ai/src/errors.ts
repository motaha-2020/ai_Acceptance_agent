/** Vendor-neutral failure categories. Adapters map SDK errors onto these. */
export type ProviderErrorKind =
  | 'rate_limit' // 429
  | 'server' // 5xx / overloaded
  | 'timeout'
  | 'network'
  | 'auth' // 401/403
  | 'bad_request' // 400/404/422: our request is wrong, retrying will not help
  | 'refusal' // the model declined to answer
  | 'invalid_output' // response could not be parsed/validated even after the repair retry
  | 'unknown';

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set(['rate_limit', 'server', 'timeout', 'network']);

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly provider: string;
  /** Server-suggested wait (Retry-After), when known. */
  readonly retryAfterMs?: number;

  constructor(
    provider: string,
    kind: ProviderErrorKind,
    message: string,
    opts: { status?: number; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(`[${provider}] ${kind}: ${message}`, { cause: opts.cause });
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}

/** Maps an HTTP status code to an error kind. */
export function kindFromStatus(status: number | undefined): ProviderErrorKind {
  if (status === undefined) return 'network';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  if (status >= 400) return 'bad_request';
  return 'unknown';
}

/** Parses a Retry-After header value (seconds or HTTP date). */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}
