/** Eval metrics (T3.4): pure functions over EvalRecords so they are unit-testable with fixtures. */
import { z } from 'zod';

export const EvalRecord = z.object({
  id: z.string(),
  kind: z.enum(['snag', 'good']),
  category: z.string(),
  categoryKnown: z.boolean(),
  expectedVerdict: z.enum(['accept', 'reject']),
  expectedCodes: z.array(z.string()),
  source: z.string().optional(),
  predicted: z
    .object({
      verdict: z.enum(['accept', 'reject', 'uncertain']),
      confidence: z.number(),
      codes: z.array(z.string()),
      categoryMatches: z.boolean(),
      detectedCategory: z.string().optional(),
      qualityIssues: z.array(z.string()),
    })
    .optional(),
  error: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string().optional(),
  latencyMs: z.number(),
  costUsd: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  escalated: z.boolean().optional(),
  localQualityIssues: z.array(z.string()).optional(),
});
export type EvalRecord = z.infer<typeof EvalRecord>;

export type PredictedOutcome = 'accept' | 'reject' | 'uncertain' | 'error';

export interface CodeStats {
  code: string;
  tp: number;
  fp: number;
  fn: number;
  /** Number of photos where the code was expected. */
  support: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface EvalMetrics {
  photos: number;
  errors: number;
  /** confusion[expected][predicted] */
  confusion: Record<'accept' | 'reject', Record<PredictedOutcome, number>>;
  /** Correct accept/reject over photos with a decided verdict (accept|reject). */
  decidedAccuracy: number | null;
  /** Correct over all photos (uncertain and errors count as wrong). */
  strictAccuracy: number | null;
  /** Share of photos answered "uncertain". */
  uncertainRate: number | null;
  /** Snag photos NOT auto-accepted (reject or uncertain -> a human sees them). Key safety metric. */
  snagCatchRate: number | null;
  /** Snag photos predicted "accept": the dangerous error. */
  falseAcceptRate: number | null;
  /** Assumed-good photos predicted "reject". */
  falseRejectRate: number | null;
  /** Snag photos where at least one expected code was predicted (photos with expected codes only). */
  snagCodeHitRate: number | null;
  perCode: CodeStats[];
  micro: { precision: number | null; recall: number | null; f1: number | null };
  latencyMs: { avg: number | null; p50: number | null; p95: number | null };
  cost: { totalUsd: number; perPhotoUsd: number | null; pricedPhotos: number };
  tokens: { input: number; output: number };
  escalationRate: number | null;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);
function f1(p: number | null, r: number | null): number | null {
  if (p === null || r === null) return null;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

export function percentile(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx] ?? null;
}

/**
 * Codes the model emitted that count for scoring. For snag photos the declared category was inferred,
 * so WRONG_CATEGORY is ignored there.
 */
export function scoredCodes(r: EvalRecord): string[] {
  const codes = new Set(r.predicted?.codes ?? []);
  if (!r.categoryKnown) codes.delete('WRONG_CATEGORY');
  return [...codes];
}

export function outcome(r: EvalRecord): PredictedOutcome {
  return r.error || !r.predicted ? 'error' : r.predicted.verdict;
}

export function computeMetrics(records: readonly EvalRecord[]): EvalMetrics {
  const confusion: EvalMetrics['confusion'] = {
    accept: { accept: 0, reject: 0, uncertain: 0, error: 0 },
    reject: { accept: 0, reject: 0, uncertain: 0, error: 0 },
  };
  const codeMap = new Map<string, CodeStats>();
  const stat = (code: string): CodeStats => {
    let s = codeMap.get(code);
    if (!s) {
      s = { code, tp: 0, fp: 0, fn: 0, support: 0, precision: null, recall: null, f1: null };
      codeMap.set(code, s);
    }
    return s;
  };
  let snagWithCodes = 0;
  let snagHit = 0;

  for (const r of records) {
    confusion[r.expectedVerdict][outcome(r)]++;
    if (!r.predicted) {
      for (const c of r.expectedCodes) {
        stat(c).fn++;
        stat(c).support++;
      }
      if (r.kind === 'snag' && r.expectedCodes.length) snagWithCodes++;
      continue;
    }
    const expected = new Set(r.expectedCodes);
    const predicted = new Set(scoredCodes(r));
    for (const c of expected) {
      stat(c).support++;
      if (predicted.has(c)) stat(c).tp++;
      else stat(c).fn++;
    }
    for (const c of predicted) if (!expected.has(c)) stat(c).fp++;
    if (r.kind === 'snag' && expected.size) {
      snagWithCodes++;
      if ([...expected].some((c) => predicted.has(c))) snagHit++;
    }
  }

  const perCode = [...codeMap.values()]
    .map((s) => {
      const precision = ratio(s.tp, s.tp + s.fp);
      const recall = ratio(s.tp, s.tp + s.fn);
      return { ...s, precision, recall, f1: f1(precision, recall) };
    })
    .sort((a, b) => b.support - a.support || b.fp - a.fp || a.code.localeCompare(b.code));
  const tp = perCode.reduce((t, s) => t + s.tp, 0);
  const fp = perCode.reduce((t, s) => t + s.fp, 0);
  const fn = perCode.reduce((t, s) => t + s.fn, 0);
  const microP = ratio(tp, tp + fp);
  const microR = ratio(tp, tp + fn);

  const n = records.length;
  const ca = confusion.accept;
  const cr = confusion.reject;
  const expAccept = ca.accept + ca.reject + ca.uncertain + ca.error;
  const expReject = cr.accept + cr.reject + cr.uncertain + cr.error;
  const decided = ca.accept + ca.reject + cr.accept + cr.reject;
  const correct = ca.accept + cr.reject;
  const ok = records.filter((r) => !r.error && r.predicted);
  const latencies = ok.map((r) => r.latencyMs);
  const priced = records.filter((r) => r.costUsd !== undefined);
  const totalUsd = priced.reduce((t, r) => t + (r.costUsd ?? 0), 0);
  const withEscalation = records.filter((r) => r.escalated !== undefined);

  return {
    photos: n,
    errors: ca.error + cr.error,
    confusion,
    decidedAccuracy: ratio(correct, decided),
    strictAccuracy: ratio(correct, n),
    uncertainRate: ratio(ca.uncertain + cr.uncertain, n),
    snagCatchRate: ratio(cr.reject + cr.uncertain, expReject),
    falseAcceptRate: ratio(cr.accept, expReject),
    falseRejectRate: ratio(ca.reject, expAccept),
    snagCodeHitRate: ratio(snagHit, snagWithCodes),
    perCode,
    micro: { precision: microP, recall: microR, f1: f1(microP, microR) },
    latencyMs: {
      avg: latencies.length ? latencies.reduce((t, x) => t + x, 0) / latencies.length : null,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    cost: { totalUsd, perPhotoUsd: ratio(totalUsd, priced.length), pricedPhotos: priced.length },
    tokens: {
      input: records.reduce((t, r) => t + (r.inputTokens ?? 0), 0),
      output: records.reduce((t, r) => t + (r.outputTokens ?? 0), 0),
    },
    escalationRate: withEscalation.length ? ratio(withEscalation.filter((r) => r.escalated).length, withEscalation.length) : null,
  };
}
