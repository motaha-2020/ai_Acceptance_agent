import { describe, expect, it } from 'vitest';
import type { AnalysisMeta, AnalysisProvider, AnalysisResult } from '@acceptance/shared';
import { VisionProvider, type VendorClient, type VendorReply, type VendorRequest } from '../src/core.js';
import { CascadeProvider, escalationReasons, DEFAULT_CASCADE_POLICY } from '../src/cascade.js';
import { ProviderError } from '../src/errors.js';
import { ACCEPT, flatJpeg, noiseJpeg, REJECT } from './helpers.js';

const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 5000, cacheWriteTokens: 0 };

/** Vendor that replays scripted answers (string = model text, Error = thrown). */
class ScriptedVendor implements VendorClient {
  readonly vendor = 'scripted';
  readonly model = 'm';
  readonly requests: VendorRequest[] = [];
  constructor(private readonly script: Array<string | Error>) {}
  async complete(req: VendorRequest): Promise<VendorReply> {
    this.requests.push(req);
    const next = this.script.shift();
    if (next === undefined) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    return { text: next, usage, model: 'm' };
  }
}

const prices = { m: { inputPerM: 1, outputPerM: 10, cacheReadPerM: 0.1 } };
const fastRetry = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} };

describe('VisionProvider core', async () => {
  const image = { data: await noiseJpeg(), mediaType: 'image/jpeg' as const };

  it('returns a validated result with cost and prompt version', async () => {
    const vendor = new ScriptedVendor([JSON.stringify(REJECT)]);
    const p = new VisionProvider(vendor, { prices, retry: fastRetry });
    const { result, meta } = await p.analyze({ image, category: 'duct', context: { hostname: 'R21C-ASR' } });
    expect(result.verdict).toBe('reject');
    expect(meta.vendorCalls).toBe(1);
    expect(meta.inputTokens).toBe(6000);
    expect(meta.costUsd).toBeCloseTo((1000 * 1 + 5000 * 0.1 + 100 * 10) / 1e6, 12);
    expect(meta.promptVersion).toMatch(/\+ai\.\d+\./);
    const parts = vendor.requests[0]!.parts;
    expect(parts.system).toContain('Step 1 - photo gate');
    expect(parts.system).toContain('PERSON_IN_FRAME');
    expect(parts.categoryBlock).toContain('# Declared category: duct');
    expect(parts.photoText).toContain('R21C-ASR');
    expect(parts.photo.width).toBeLessThanOrEqual(1568);
  });

  it('repairs once after an invalid answer, feeding the validator error back', async () => {
    const vendor = new ScriptedVendor(['{"verdict": "maybe"}', JSON.stringify(ACCEPT)]);
    const { result, meta } = await new VisionProvider(vendor, { prices, retry: fastRetry }).analyze({ image, category: 'rack' });
    expect(result.verdict).toBe('accept');
    expect(meta.repaired).toBe(true);
    expect(meta.vendorCalls).toBe(2);
    expect(meta.inputTokens).toBe(12000);
    expect(vendor.requests[1]!.repair?.previousOutput).toBe('{"verdict": "maybe"}');
    expect(vendor.requests[1]!.repair?.error).toMatch(/schema/);
  });

  it('fails with invalid_output when the repair is invalid too', async () => {
    const vendor = new ScriptedVendor(['nope', 'still nope']);
    await expect(new VisionProvider(vendor, { retry: fastRetry }).analyze({ image, category: 'rack' })).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  it('retries transient vendor errors', async () => {
    const vendor = new ScriptedVendor([new ProviderError('scripted', 'server', '503', { status: 503 }), JSON.stringify(ACCEPT)]);
    const { result } = await new VisionProvider(vendor, { retry: fastRetry }).analyze({ image, category: 'rack' });
    expect(result.verdict).toBe('accept');
  });

  it('short-circuits clearly dark photos without calling the vendor', async () => {
    const vendor = new ScriptedVendor([]);
    const dark = { data: await flatJpeg(5), mediaType: 'image/jpeg' as const };
    const { result, meta } = await new VisionProvider(vendor, { qualityGate: { mode: 'short_circuit' } }).analyze({ image: dark, category: 'rack' });
    expect(vendor.requests).toHaveLength(0);
    expect(meta.shortCircuited).toBe(true);
    expect(result.verdict).toBe('reject');
    expect(result.snags.map((s) => s.code)).toEqual(['PHOTO_TOO_DARK']);
  });

  it('hint mode passes measurements to the model and reports them in meta', async () => {
    const vendor = new ScriptedVendor([JSON.stringify(ACCEPT)]);
    const dark = { data: await flatJpeg(5), mediaType: 'image/jpeg' as const };
    const { meta } = await new VisionProvider(vendor).analyze({ image: dark, category: 'rack' });
    expect(meta.quality?.issues).toEqual(['dark']);
    expect(vendor.requests[0]!.parts.photoText).toMatch(/possible issues: dark/);
  });
});

/** Minimal provider stub for cascade tests. */
function stub(name: string, outcome: AnalysisResult | Error, costUsd = 0.001): AnalysisProvider & { calls: number } {
  return {
    name,
    calls: 0,
    async analyze() {
      this.calls++;
      if (outcome instanceof Error) throw outcome;
      const meta: AnalysisMeta = { provider: name, model: `${name}-m`, promptVersion: 'pv', latencyMs: 100, costUsd, inputTokens: 10, outputTokens: 1 };
      return { result: outcome, meta };
    },
  };
}

describe('cascade', () => {
  const req = { image: { data: new Uint8Array(), mediaType: 'image/jpeg' as const }, category: 'rack' as const };

  it('decides escalation reasons', () => {
    const p = DEFAULT_CASCADE_POLICY;
    expect(escalationReasons(ACCEPT, p)).toEqual([]);
    expect(escalationReasons({ ...ACCEPT, verdict: 'uncertain', confidence: 0.4 }, p)).toEqual(['uncertain', 'low_confidence']);
    expect(escalationReasons({ ...REJECT, categoryMatches: false }, p)).toEqual(['category_mismatch']);
    expect(escalationReasons({ ...ACCEPT, qualityIssues: ['blurry'] }, p)).toEqual([]);
    expect(escalationReasons({ ...ACCEPT, qualityIssues: ['blurry'] }, { ...p, escalateOnQualityIssue: true })).toEqual(['quality_issue']);
  });

  it('keeps a confident cheap answer', async () => {
    const a = stub('cheap', ACCEPT);
    const b = stub('strong', REJECT);
    const { result, meta } = await new CascadeProvider(a, b).analyze(req);
    expect(result).toEqual(ACCEPT);
    expect(meta.escalated).toBe(false);
    expect(b.calls).toBe(0);
  });

  it('escalates low confidence and sums cost/latency', async () => {
    const a = stub('cheap', { ...ACCEPT, confidence: 0.5 }, 0.001);
    const b = stub('strong', REJECT, 0.01);
    const { result, meta } = await new CascadeProvider(a, b, { minConfidence: 0.7 }).analyze(req);
    expect(result).toEqual(REJECT);
    expect(meta.escalated).toBe(true);
    expect(meta.escalationReasons).toEqual(['low_confidence']);
    expect(meta.costUsd).toBeCloseTo(0.011, 10);
    expect(meta.latencyMs).toBe(200);
    expect(meta.stages.map((s) => s.provider)).toEqual(['cheap', 'strong']);
  });

  it('escalates when the cheap provider fails', async () => {
    const { result, meta } = await new CascadeProvider(stub('cheap', new Error('down')), stub('strong', REJECT)).analyze(req);
    expect(result).toEqual(REJECT);
    expect(meta.escalationReasons).toEqual(['error']);
  });

  it('never auto-accepts when the strong provider fails', async () => {
    const { result, meta } = await new CascadeProvider(stub('cheap', { ...ACCEPT, confidence: 0.6 }), stub('strong', new Error('down'))).analyze(req);
    expect(result.verdict).toBe('uncertain');
    expect(meta.stages[1]?.error).toBe('down');
  });

  it('propagates when both fail', async () => {
    await expect(new CascadeProvider(stub('a', new Error('x')), stub('b', new Error('y'))).analyze(req)).rejects.toThrow();
  });
});
