import { DomainError } from '../core/errors.js';

/**
 * Fixed-window attempt limiter for the login endpoint (per ip+email and per ip).
 * In-memory: correct for one API instance; move to Redis when the API is scaled out.
 */
export class LoginRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Count an attempt; throws 429 when the key is over its limit. */
  hit(key: string, max = this.max): void {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + this.windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
      throw new DomainError(429, 'TOO_MANY_REQUESTS', 'Too many login attempts, try again later', { retryAfterSeconds: retryAfter });
    }
    if (this.buckets.size > 10_000) this.sweep(t);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(t: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }
}
