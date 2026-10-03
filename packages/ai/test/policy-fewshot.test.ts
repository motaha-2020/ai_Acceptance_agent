import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFewShotSource, FEW_SHOT_MANIFEST, FewShotManifest, type FewShotImageStore } from '../src/index.js';
import { decideVerdict, DEFAULT_VERDICT_POLICY, LEGACY_VERDICT_POLICY, type ModelOutput, type ModelSnag } from '../src/policy.js';

const snag = (code: string, confidence: number, severity: ModelSnag['severity'] = 'major'): ModelSnag => ({
  code,
  severity,
  confidence,
  evidence: 'x',
  bbox: { x: 0, y: 0, w: 1, h: 1 },
  reasonAr: 'ملاحظة',
  reasonEn: 'note',
});
const out = (snags: ModelSnag[], verdict: ModelOutput['verdict'] = 'accept', confidence = 0.8, extra: Partial<ModelOutput> = {}): ModelOutput => ({
  categoryMatches: true,
  qualityIssues: [],
  verdict,
  confidence,
  snags,
  ...extra,
});

describe('verdict policy (T3.5)', () => {
  it('rejects only on confident major snags; weaker majors route to a human', () => {
    expect(decideVerdict(out([snag('SPARE_LEFT_IN_ODF', 0.8)], 'reject'), 'odf_cross_connect').result.verdict).toBe('reject');
    const mid = decideVerdict(out([snag('SPARE_LEFT_IN_ODF', 0.5)]), 'odf_cross_connect');
    expect(mid.result.verdict).toBe('uncertain');
    expect(mid.reason).toBe('major_below_reject_confidence');
  });

  it('uses the taxonomy severity, so a minor code cannot reject', () => {
    const r = decideVerdict(out([snag('DUST_OR_DIRT', 0.9, 'critical')], 'reject'), 'rack');
    expect(r.result.snags[0]?.severity).toBe('minor');
    expect(r.result.verdict).not.toBe('reject');
    expect(r.result.verdict).toBe('uncertain');
  });

  it('holds an accept when any defect is reported at low confidence (no silent accept)', () => {
    const r = decideVerdict(out([snag('LABEL_DAMAGED', 0.3, 'minor')]), 'rack');
    expect(r.result.verdict).toBe('uncertain');
    expect(r.reason).toBe('suspicion');
    expect(r.result.snags).toEqual([]); // below report threshold, not shown
  });

  it('a low-confidence clean accept becomes uncertain', () => {
    expect(decideVerdict(out([], 'accept', 0.6), 'duct').reason).toBe('low_confidence_accept');
    expect(decideVerdict(out([], 'accept', 0.8), 'duct').result.verdict).toBe('accept');
  });

  it('wrong category routes to a human; a related category is not wrong', () => {
    const wrong = decideVerdict(out([], 'uncertain', 0.7, { categoryMatches: false, detectedCategory: 'pdu' }), 'duct');
    expect(wrong.result.verdict).toBe('uncertain');
    expect(wrong.result.snags.map((s) => s.code)).toEqual(['WRONG_CATEGORY']);
    expect(wrong.result.qualityIssues).toContain('wrong_subject');
    const related = decideVerdict(out([], 'accept', 0.8, { categoryMatches: false, detectedCategory: 'odf_cross_connect_labels', qualityIssues: ['wrong_subject'] }), 'odf_cross_connect');
    expect(related.result.categoryMatches).toBe(true);
    expect(related.result.verdict).toBe('accept');
    expect(related.result.qualityIssues).not.toContain('wrong_subject');
  });

  it('SID-derived codes need high confidence to be reported', () => {
    const r = decideVerdict(out([snag('LABEL_INFO_INCOMPLETE', 0.7, 'minor')], 'accept', 0.8), 'power_labels', { ...DEFAULT_VERDICT_POLICY, holdConfidence: 1 });
    expect(r.result.snags).toEqual([]);
    expect(r.dropped).toContain('LABEL_INFO_INCOMPLETE');
  });

  it('legacy policy: any snag rejects', () => {
    expect(decideVerdict(out([snag('DUST_OR_DIRT', 0.1, 'minor')], 'accept'), 'rack', LEGACY_VERDICT_POLICY).result.verdict).toBe('reject');
  });
});

describe('few-shot manifest and loader', () => {
  it('the bundled curated manifest is valid and every example has an explanation', () => {
    const m = FewShotManifest.parse(FEW_SHOT_MANIFEST);
    expect(m.examples.length).toBeGreaterThan(20);
    expect(m.examples.every((e) => e.explanation)).toBe(true);
    expect(new Set(m.examples.map((e) => e.id)).size).toBe(m.examples.length);
  });

  it('loads per category lazily, verifies sha256 and can degrade on errors', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const id = createHash('sha256').update(bytes).digest('hex');
    const manifest: FewShotManifest = { version: 't', maxSide: 512, examples: [{ id, category: 'duct', kind: 'good', codes: [], explanation: 'ok' }] };
    let calls = 0;
    const store: FewShotImageStore = { get: async () => (calls++, bytes), describe: () => 'mem' };
    const src = createFewShotSource(manifest, store);
    expect(await src('duct')).toHaveLength(1);
    await src('duct');
    expect(calls).toBe(1);
    expect(await src('rack')).toEqual([]);

    const bad: FewShotImageStore = { get: async () => new Uint8Array([9]), describe: () => 'bad' };
    await expect(Promise.resolve(createFewShotSource(manifest, bad)('duct'))).rejects.toThrow(/sha256/);
    const logs: string[] = [];
    expect(await createFewShotSource(manifest, bad, { onError: 'skip', log: (m) => logs.push(m) })('duct')).toEqual([]);
    expect(logs[0]).toMatch(/unavailable/);
  });
});
