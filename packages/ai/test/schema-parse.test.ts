import { describe, expect, it } from 'vitest';
import { SNAG_CODES } from '@acceptance/checklist';
import { baseAnalysisSchema, toClaudeSchema, toGeminiSchema, toOpenAISchema, type JsonSchema } from '../src/schema.js';
import { extractJson, normalizeResult, parseAnalysis, stripNulls } from '../src/parse.js';
import { REJECT } from './helpers.js';

const walk = (node: unknown, visit: (n: JsonSchema) => void): void => {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === 'object') {
    visit(node as JsonSchema);
    Object.values(node).forEach((v) => walk(v, visit));
  }
};
const snagItemProps = (s: JsonSchema): JsonSchema =>
  ((((s.properties as JsonSchema).snags as JsonSchema).items as JsonSchema).properties as JsonSchema);

describe('schema conversion', () => {
  it('derives an inlined schema with the taxonomy enum and no unsupported keywords', () => {
    const s = baseAnalysisSchema();
    expect(s.type).toBe('object');
    expect(s.$schema).toBeUndefined();
    expect((snagItemProps(s).code as JsonSchema).enum).toEqual([...SNAG_CODES]);
    expect(s.required).toEqual(expect.arrayContaining(['categoryMatches', 'qualityIssues', 'verdict', 'confidence', 'snags']));
    walk(s, (n) => {
      expect(n.minimum).toBeUndefined();
      expect(n.maximum).toBeUndefined();
      expect(n.$ref).toBeUndefined();
    });
  });

  it('claude: every object closed with additionalProperties:false, optional fields stay optional', () => {
    const s = toClaudeSchema();
    walk(s, (n) => {
      if (n.type === 'object') expect(n.additionalProperties).toBe(false);
    });
    expect(s.required).not.toContain('detectedCategory');
  });

  it('openai strict: all properties required, optional ones nullable', () => {
    const s = toOpenAISchema();
    walk(s, (n) => {
      if (n.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
    });
    const detected = (s.properties as JsonSchema).detectedCategory as JsonSchema;
    expect(detected.anyOf).toEqual(expect.arrayContaining([{ type: 'null' }]));
    expect(snagItemProps(s).bbox).toHaveProperty('anyOf');
  });

  it('gemini: no additionalProperties anywhere', () => {
    walk(toGeminiSchema(), (n) => expect(n.additionalProperties).toBeUndefined());
  });
});

describe('response parsing and repair support', () => {
  it('extracts JSON from fences and prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a": {"b": 2}} thanks')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('no json')).toThrow();
  });

  it('accepts OpenAI-style nulls for optional fields', () => {
    const raw = { ...REJECT, detectedCategory: null, snags: [{ ...REJECT.snags[0], bbox: null }] };
    const out = parseAnalysis(JSON.stringify(raw));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.detectedCategory).toBeUndefined();
      expect(out.result.snags[0]?.bbox).toBeUndefined();
    }
    expect(stripNulls([{ a: null, b: 1 }])).toEqual([{ b: 1 }]);
  });

  it('reports schema errors in a model-readable way', () => {
    const out = parseAnalysis(JSON.stringify({ ...REJECT, confidence: 1.7, verdict: 'maybe' }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toMatch(/confidence/);
      expect(out.error).toMatch(/verdict/);
    }
    const bad = parseAnalysis('{"verdict": "accept"');
    expect(bad.ok).toBe(false);
  });

  it('normalises: snags force reject, mismatch adds WRONG_CATEGORY, duplicate codes collapse', () => {
    const r = normalizeResult({ ...REJECT, verdict: 'accept', snags: [REJECT.snags[0]!, REJECT.snags[0]!] });
    expect(r.verdict).toBe('reject');
    expect(r.snags).toHaveLength(1);
    const m = normalizeResult({ categoryMatches: false, detectedCategory: 'duct', qualityIssues: [], verdict: 'uncertain', confidence: 0.7, snags: [] });
    expect(m.snags.map((s) => s.code)).toEqual(['WRONG_CATEGORY']);
    expect(m.qualityIssues).toContain('wrong_subject');
    expect(m.verdict).toBe('reject');
    expect(m.detectedCategory).toBe('duct');
    const ok = normalizeResult({ categoryMatches: true, detectedCategory: 'duct', qualityIssues: [], verdict: 'accept', confidence: 0.9, snags: [] });
    expect(ok.detectedCategory).toBeUndefined();
  });
});
