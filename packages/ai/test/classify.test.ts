import { describe, expect, it } from 'vitest';
import { PhotoCategory } from '@acceptance/shared';
import { CategoryClassifier, CLASSIFY_PROMPT_VERSION, classifySystemPrompt, parseGuess } from '../src/classify.js';
import type { VendorClient, VendorReply, VendorRequest } from '../src/core.js';
import { ClaudeVendor } from '../src/providers/claude.js';
import { GeminiVendor } from '../src/providers/gemini.js';
import { OpenAIVendor } from '../src/providers/openai.js';
import { ZERO_USAGE } from '../src/pricing.js';
import { noiseJpeg } from './helpers.js';

function stubVendor(texts: string[]): VendorClient & { requests: VendorRequest[] } {
  const requests: VendorRequest[] = [];
  return {
    vendor: 'stub',
    model: 'gemini-3.1-flash-lite',
    requests,
    async complete(req): Promise<VendorReply> {
      requests.push(req);
      return { text: texts.shift() ?? '', usage: { ...ZERO_USAGE, inputTokens: 1000, outputTokens: 20 }, model: 'gemini-3.1-flash-lite' };
    },
  };
}

const noRetry = { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 };

describe('category classification (bulk upload)', () => {
  it('lists every category in a deterministic system prompt', () => {
    const p = classifySystemPrompt();
    for (const c of PhotoCategory.options) expect(p).toContain(`- ${c}:`);
    expect(classifySystemPrompt()).toBe(p);
  });

  it('returns the guess and sends the classification schema, not the analysis schema', async () => {
    const v = stubVendor(['{"category":"pdu","confidence":0.91,"alternative":"power_system"}']);
    const out = await new CategoryClassifier(v, { retry: noRetry }).classify(await noiseJpeg(200, 150));
    expect(out.guess).toEqual({ category: 'pdu', confidence: 0.91, alternative: 'power_system' });
    expect(out.meta.promptVersion.startsWith(`${CLASSIFY_PROMPT_VERSION}.`)).toBe(true);
    expect(out.meta.costUsd).toBeGreaterThan(0);
    const schema = v.requests[0]!.responseSchema!;
    expect(schema.name).toBe('category_guess');
    expect(JSON.stringify(schema.schema)).toContain('odf_tie_labels');
    expect(JSON.stringify(schema.schema)).not.toContain('snags');
  });

  it('repairs one invalid answer, then gives up', async () => {
    const v = stubVendor(['{"category":"kitchen","confidence":0.5}', '{"category":"rack","confidence":0.6}']);
    expect((await new CategoryClassifier(v, { retry: noRetry }).classify(await noiseJpeg(200, 150))).guess.category).toBe('rack');
    expect(v.requests[1]!.repair?.error).toContain('category');

    const bad = stubVendor(['nope', 'still nope']);
    await expect(new CategoryClassifier(bad, { retry: noRetry }).classify(await noiseJpeg(200, 150))).rejects.toThrow(/classification after repair/);
  });

  it('drops an alternative equal to the category', () => {
    expect(parseGuess('{"category":"rack","confidence":0.7,"alternative":"rack"}')).toEqual({ ok: true, guess: { category: 'rack', confidence: 0.7 } });
  });

  it('every vendor puts the per-request schema in its structured-output field', () => {
    const responseSchema = { name: 'category_guess', schema: { type: 'object', properties: { category: { type: 'string', enum: ['rack'] } }, required: ['category'] } };
    const parts = { system: 's', categoryBlock: 'c', fewShot: [], photo: { data: Buffer.alloc(0), mediaType: 'image/jpeg' as const, width: 1, height: 1, base64: '' }, photoText: 't', promptVersion: 'v' };
    const claude = new ClaudeVendor({ apiKey: 't' }).buildParams({ parts, responseSchema });
    expect(JSON.stringify(claude.output_config?.format)).toContain('"enum":["rack"]');
    const gemini = new GeminiVendor({ apiKey: 't' }).buildParams({ parts, responseSchema });
    expect(JSON.stringify(gemini.config?.responseJsonSchema)).toContain('"enum":["rack"]');
    const openai = new OpenAIVendor({ apiKey: 't' }).buildParams({ parts, responseSchema });
    expect(JSON.stringify(openai.text?.format)).toContain('"name":"category_guess"');
    // Without a per-request schema the analysis schema is unchanged.
    expect(JSON.stringify(new GeminiVendor({ apiKey: 't' }).buildParams({ parts }).config?.responseJsonSchema)).toContain('snags');
  });
});
