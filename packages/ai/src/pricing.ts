/**
 * Token price table used to estimate cost per analysis.
 *
 * IMPORTANT: these numbers are CONFIGURATION, not authoritative prices. They were copied from the
 * vendors' public pricing pages on 2026-10-03 (Anthropic model table, ai.google.dev/gemini-api/docs/pricing,
 * developers.openai.com/api/docs/pricing) and WILL drift. Verify them against each vendor's pricing page
 * before trusting any cost figure, and override with `AI_PRICES_FILE` (JSON: { "<model>": ModelPrice })
 * or the `prices` option rather than editing numbers inline. Image tokens are billed as input tokens by
 * all three vendors. Gemini 3.6-3.8 Flash list promotional prices valid until 2026-12-31 (they double on
 * 2027-01-01).
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const ModelPrice = z.object({
  /** USD per 1M uncached input tokens. */
  inputPerM: z.number().nonnegative(),
  /** USD per 1M output tokens (includes thinking/reasoning tokens). */
  outputPerM: z.number().nonnegative(),
  /** USD per 1M input tokens served from cache. Defaults to inputPerM. */
  cacheReadPerM: z.number().nonnegative().optional(),
  /** USD per 1M input tokens written to cache (Anthropic: 1.25x input for 5-minute TTL). Defaults to inputPerM. */
  cacheWritePerM: z.number().nonnegative().optional(),
});
export type ModelPrice = z.infer<typeof ModelPrice>;
export const PriceTable = z.record(ModelPrice);
export type PriceTable = z.infer<typeof PriceTable>;

/** Normalised token usage of one or more vendor calls. `inputTokens` excludes cache reads/writes. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export function totalInputTokens(u: TokenUsage): number {
  return u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

/** Default prices (USD per 1M tokens). UNVERIFIED CONFIG - see the header comment. */
export const DEFAULT_PRICES: PriceTable = {
  // Anthropic (cache write = 1.25x input for the default 5-minute TTL)
  'claude-opus-5-5': { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2, cacheWritePerM: 5 },
  'claude-sonnet-5-5': { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.2, cacheWritePerM: 2.5 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5, cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  // Google Gemini (paid tier, <=200k prompt; implicit caching has no write surcharge)
  'gemini-3.8-flash': { inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075 },
  'gemini-3.7-flash': { inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075 },
  'gemini-3.6-flash': { inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075 },
  'gemini-3.5-flash': { inputPerM: 1.5, outputPerM: 9, cacheReadPerM: 0.15 },
  'gemini-3.5-flash-lite': { inputPerM: 0.3, outputPerM: 2.5 },
  'gemini-3.1-flash-lite': { inputPerM: 0.25, outputPerM: 1.5, cacheReadPerM: 0.025 },
  'gemini-3.1-pro-preview': { inputPerM: 2, outputPerM: 12, cacheReadPerM: 0.2 },
  // OpenAI (standard tier)
  'gpt-6.1-sol': { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.1 },
  'gpt-6-luna': { inputPerM: 0.1, outputPerM: 0.5, cacheReadPerM: 0.01 },
  'gpt-5.5': { inputPerM: 5, outputPerM: 30, cacheReadPerM: 0.5 },
  'gpt-5.4-mini': { inputPerM: 0.75, outputPerM: 4.5, cacheReadPerM: 0.075 },
  'gpt-5-mini': { inputPerM: 0.25, outputPerM: 2, cacheReadPerM: 0.025 },
  // Offline fake provider used by --dry-run
  fake: { inputPerM: 0, outputPerM: 0 },
};

/** Exact match first, then the longest table key that prefixes the model id (handles dated snapshots). */
export function findPrice(model: string, table: PriceTable = DEFAULT_PRICES): ModelPrice | undefined {
  const exact = table[model];
  if (exact) return exact;
  let best: string | undefined;
  for (const key of Object.keys(table)) {
    if (model.startsWith(key) && (best === undefined || key.length > best.length)) best = key;
  }
  return best === undefined ? undefined : table[best];
}

/** Estimated USD cost, or undefined when the model has no price entry. */
export function costUsd(model: string, usage: TokenUsage, table: PriceTable = DEFAULT_PRICES): number | undefined {
  const p = findPrice(model, table);
  if (!p) return undefined;
  const usd =
    usage.inputTokens * p.inputPerM +
    usage.cacheReadTokens * (p.cacheReadPerM ?? p.inputPerM) +
    usage.cacheWriteTokens * (p.cacheWritePerM ?? p.inputPerM) +
    usage.outputTokens * p.outputPerM;
  return usd / 1_000_000;
}

/** Default table merged with an optional JSON override file (env AI_PRICES_FILE). */
export function loadPriceTable(overrideFile = process.env.AI_PRICES_FILE): PriceTable {
  if (!overrideFile) return DEFAULT_PRICES;
  const parsed = PriceTable.parse(JSON.parse(readFileSync(overrideFile, 'utf8')));
  return { ...DEFAULT_PRICES, ...parsed };
}
