import { describe, expect, it } from 'vitest';
import { computeMetrics, percentile, scoredCodes, type EvalRecord } from '../eval/metrics.js';
import { renderComparison, renderSummary, type RunInfo } from '../eval/report.js';

const rec = (over: Partial<EvalRecord> & Pick<EvalRecord, 'id' | 'kind' | 'expectedVerdict'>): EvalRecord => ({
  category: 'rack',
  categoryKnown: over.kind === 'good',
  expectedCodes: [],
  provider: 'p',
  model: 'm',
  latencyMs: 100,
  ...over,
});
const pred = (verdict: 'accept' | 'reject' | 'uncertain', codes: string[] = [], confidence = 0.9) => ({
  verdict,
  confidence,
  codes,
  categoryMatches: true,
  qualityIssues: [],
});

/**
 * Fixture (hand-computed):
 *  s1 snag  exp [A,B]  pred reject [A,C]      -> A tp, B fn, C fp
 *  s2 snag  exp [A]    pred accept []         -> A fn
 *  s3 snag  exp [B]    pred uncertain [B, WRONG_CATEGORY] -> B tp (WRONG_CATEGORY ignored: category unknown)
 *  s4 snag  exp []     error
 *  g1 good  exp []     pred accept
 *  g2 good  exp []     pred reject [C]        -> C fp
 *  g3 good  exp []     pred uncertain
 * A: tp1 fn1 fp0 -> P 1, R .5 ; B: tp1 fn1 -> R .5 ; C: fp2 -> P 0
 */
const fixture: EvalRecord[] = [
  rec({ id: 's1', kind: 'snag', expectedVerdict: 'reject', expectedCodes: ['A', 'B'], predicted: pred('reject', ['A', 'C']), costUsd: 0.01, latencyMs: 100 }),
  rec({ id: 's2', kind: 'snag', expectedVerdict: 'reject', expectedCodes: ['A'], predicted: pred('accept'), costUsd: 0.01, latencyMs: 200 }),
  rec({ id: 's3', kind: 'snag', expectedVerdict: 'reject', expectedCodes: ['B'], predicted: pred('uncertain', ['B', 'WRONG_CATEGORY'], 0.4), costUsd: 0.02, latencyMs: 300, escalated: true }),
  rec({ id: 's4', kind: 'snag', expectedVerdict: 'reject', error: 'boom' }),
  rec({ id: 'g1', kind: 'good', expectedVerdict: 'accept', predicted: pred('accept'), costUsd: 0.01, latencyMs: 400, escalated: false }),
  rec({ id: 'g2', kind: 'good', expectedVerdict: 'accept', predicted: pred('reject', ['C']), costUsd: 0.01, latencyMs: 500 }),
  rec({ id: 'g3', kind: 'good', expectedVerdict: 'accept', predicted: pred('uncertain'), latencyMs: 600 }),
];

describe('eval metrics', () => {
  const m = computeMetrics(fixture);

  it('per-code precision/recall', () => {
    const by = Object.fromEntries(m.perCode.map((s) => [s.code, s]));
    expect(by.A).toMatchObject({ tp: 1, fp: 0, fn: 1, support: 2, precision: 1, recall: 0.5 });
    expect(by.A?.f1).toBeCloseTo(2 / 3, 10);
    expect(by.B).toMatchObject({ tp: 1, fp: 0, fn: 1, support: 2, recall: 0.5 });
    expect(by.C).toMatchObject({ tp: 0, fp: 2, fn: 0, support: 0, precision: 0, recall: null, f1: null });
    expect(by.WRONG_CATEGORY).toBeUndefined();
    expect(m.micro.precision).toBeCloseTo(2 / 4, 10);
    expect(m.micro.recall).toBeCloseTo(2 / 4, 10);
  });

  it('photo-level accuracy, confusion and safety rates', () => {
    expect(m.confusion.reject).toEqual({ accept: 1, reject: 1, uncertain: 1, error: 1 });
    expect(m.confusion.accept).toEqual({ accept: 1, reject: 1, uncertain: 1, error: 0 });
    expect(m.decidedAccuracy).toBeCloseTo(2 / 4, 10);
    expect(m.strictAccuracy).toBeCloseTo(2 / 7, 10);
    expect(m.uncertainRate).toBeCloseTo(2 / 7, 10);
    expect(m.snagCatchRate).toBeCloseTo(2 / 4, 10);
    expect(m.falseAcceptRate).toBeCloseTo(1 / 4, 10);
    expect(m.falseRejectRate).toBeCloseTo(1 / 3, 10);
    expect(m.snagCodeHitRate).toBeCloseTo(2 / 3, 10);
    expect(m.errors).toBe(1);
  });

  it('latency, cost and escalation', () => {
    expect(m.latencyMs.avg).toBeCloseTo(350, 10);
    expect(m.latencyMs.p50).toBe(300);
    expect(m.latencyMs.p95).toBe(600);
    expect(m.cost.totalUsd).toBeCloseTo(0.06, 10);
    expect(m.cost.perPhotoUsd).toBeCloseTo(0.012, 10);
    expect(m.escalationRate).toBe(0.5);
  });

  it('helpers', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5, 1, 3], 0.5)).toBe(3);
    expect(scoredCodes(fixture[2]!)).toEqual(['B']);
    expect(computeMetrics([]).decidedAccuracy).toBeNull();
  });

  it('renders summary and comparison markdown', () => {
    const info: RunInfo = { label: 'run-a', provider: 'p', model: 'm', startedAt: 't', dryRun: false, args: {} };
    const md = renderSummary(m, info);
    expect(md).toContain('| accuracy (decided verdicts) | 50.0% |');
    expect(md).toContain('| A | 2 | 1 | 0 | 1 | 100.0% | 50.0% | 66.7% |');
    const cmp = renderComparison([{ info, metrics: m }, { info: { ...info, label: 'run-b' }, metrics: computeMetrics(fixture.slice(0, 3)) }]);
    expect(cmp).toContain('| metric | run-a | run-b |');
    expect(cmp).toContain('| cost per 1000 photos | $12.0000 |');
  });
});
