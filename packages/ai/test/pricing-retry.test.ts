import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { costUsd, findPrice, loadPriceTable } from '../src/pricing.js';
import { ProviderError, kindFromStatus, parseRetryAfter } from '../src/errors.js';
import { backoffDelay, withRetry } from '../src/retry.js';

describe('cost calculation', () => {
  it('prices uncached, cache read, cache write and output tokens separately', () => {
    const table = { m: { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.2, cacheWritePerM: 2.5 } };
    // 1000*2 + 10000*0.2 + 4000*2.5 + 500*10 = 2000 + 2000 + 10000 + 5000 = 19000 micro-USD
    expect(costUsd('m', { inputTokens: 1000, cacheReadTokens: 10_000, cacheWriteTokens: 4000, outputTokens: 500 }, table)).toBeCloseTo(0.019, 10);
  });

  it('falls back to input price when cache prices are absent and to longest prefix for snapshots', () => {
    const table = { gem: { inputPerM: 1, outputPerM: 4 }, 'gem-pro': { inputPerM: 3, outputPerM: 9 } };
    expect(costUsd('gem', { inputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, outputTokens: 0 }, table)).toBe(1);
    expect(findPrice('gem-pro-2026-01', table)?.inputPerM).toBe(3);
    expect(costUsd('unknown-model', { inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }, table)).toBeUndefined();
  });

  it('default table covers the bake-off defaults', () => {
    for (const m of ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5', 'gemini-3.8-flash', 'gpt-6.1-sol']) expect(findPrice(m)).toBeDefined();
  });

  it('merges an override file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'prices-'));
    const f = path.join(dir, 'p.json');
    writeFileSync(f, JSON.stringify({ 'gemini-3.8-flash': { inputPerM: 9, outputPerM: 9 } }));
    const t = loadPriceTable(f);
    expect(t['gemini-3.8-flash']?.inputPerM).toBe(9);
    expect(t['claude-opus-5-5']).toBeDefined();
  });
});

describe('retry with backoff', () => {
  const opts = (sleeps: number[]) => ({ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, random: () => 1, sleep: async (ms: number) => void sleeps.push(ms) });

  it('retries 429/5xx and honours Retry-After', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const out = await withRetry(async () => {
      n++;
      if (n === 1) throw new ProviderError('x', 'rate_limit', 'slow down', { status: 429, retryAfterMs: 700 });
      if (n === 2) throw new ProviderError('x', 'server', 'oops', { status: 503 });
      return 'ok';
    }, opts(sleeps));
    expect(out).toBe('ok');
    expect(sleeps).toEqual([700, 200]);
  });

  it('does not retry bad requests and gives up after maxAttempts', async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new ProviderError('x', 'bad_request', 'nope', { status: 400 }); }, opts([]))).rejects.toThrow(/bad_request/);
    expect(n).toBe(1);
    n = 0;
    await expect(withRetry(async () => { n++; throw new ProviderError('x', 'timeout', 't'); }, opts([]))).rejects.toThrow(/timeout/);
    expect(n).toBe(3);
  });

  it('caps exponential delay and maps statuses', () => {
    expect(backoffDelay(10, { maxAttempts: 1, baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 })).toBe(1000);
    expect(kindFromStatus(429)).toBe('rate_limit');
    expect(kindFromStatus(529)).toBe('server');
    expect(kindFromStatus(400)).toBe('bad_request');
    expect(kindFromStatus(undefined)).toBe('network');
    expect(parseRetryAfter('2')).toBe(2000);
  });
});
