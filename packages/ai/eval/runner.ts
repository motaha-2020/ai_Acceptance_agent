import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisMeta, AnalysisProvider, AnalysisRequest, AnalysisResult } from '@acceptance/shared';
import type { EvalItem } from './dataset.js';
import type { EvalRecord } from './metrics.js';

export function mediaTypeOf(file: string): AnalysisRequest['image']['mediaType'] {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/** Runs `fn` over items with at most `concurrency` in flight; results keep input order. */
export async function mapPool<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return out;
}

type MetaLike = AnalysisMeta & {
  escalated?: boolean;
  quality?: { issues: string[] };
  raw?: EvalRecord['raw'];
  decision?: { reason: string };
  stages?: unknown;
};

export function toRecord(item: EvalItem, out: { result: AnalysisResult; meta: MetaLike } | undefined, error: unknown, fallback: { provider: string; latencyMs: number }): EvalRecord {
  const base = {
    id: item.id,
    kind: item.kind,
    category: item.category,
    categoryKnown: item.categoryKnown,
    expectedVerdict: item.expectedVerdict,
    expectedCodes: item.expectedCodes,
    source: item.source,
    ...(item.codesUnreliable ? { codesUnreliable: true } : {}),
  };
  if (!out) {
    return { ...base, error: error instanceof Error ? error.message : String(error), provider: fallback.provider, model: '?', latencyMs: fallback.latencyMs };
  }
  const { result, meta } = out;
  return {
    ...base,
    predicted: {
      verdict: result.verdict,
      confidence: result.confidence,
      codes: result.snags.map((s) => s.code),
      categoryMatches: result.categoryMatches,
      ...(result.detectedCategory ? { detectedCategory: result.detectedCategory } : {}),
      qualityIssues: result.qualityIssues,
      snags: result.snags.map((s) => ({ code: s.code, severity: s.severity, confidence: meta.raw?.snags.find((x) => x.code === s.code)?.confidence })),
      ...(meta.decision ? { decisionReason: meta.decision.reason } : {}),
    },
    ...(meta.raw ? { raw: meta.raw } : {}),
    provider: meta.provider,
    model: meta.model,
    promptVersion: meta.promptVersion,
    latencyMs: meta.latencyMs,
    ...(meta.costUsd !== undefined ? { costUsd: meta.costUsd } : {}),
    ...(meta.inputTokens !== undefined ? { inputTokens: meta.inputTokens } : {}),
    ...(meta.outputTokens !== undefined ? { outputTokens: meta.outputTokens } : {}),
    ...(meta.escalated !== undefined ? { escalated: meta.escalated } : {}),
    ...(meta.quality ? { localQualityIssues: meta.quality.issues } : {}),
  };
}

export interface RunOptions {
  items: readonly EvalItem[];
  provider: AnalysisProvider;
  concurrency: number;
  onRecord?: (r: EvalRecord, done: number, total: number) => void;
  readImage?: (file: string) => Promise<Uint8Array>;
}

export async function runEval(opts: RunOptions): Promise<EvalRecord[]> {
  const read = opts.readImage ?? ((f: string) => readFile(f));
  let done = 0;
  return mapPool(opts.items, opts.concurrency, async (item) => {
    const t0 = Date.now();
    let record: EvalRecord;
    try {
      const data = await read(item.file);
      const out = await opts.provider.analyze({ image: { data, mediaType: mediaTypeOf(item.file) }, category: item.category });
      record = toRecord(item, out, undefined, { provider: opts.provider.name, latencyMs: 0 });
    } catch (err) {
      record = toRecord(item, undefined, err, { provider: opts.provider.name, latencyMs: Date.now() - t0 });
    }
    opts.onRecord?.(record, ++done, opts.items.length);
    return record;
  });
}
