/**
 * Adapter tests against recorded HTTP responses: the real vendor SDKs run with an injected fetch, so
 * request serialisation, response parsing, usage mapping and error classes are all exercised offline.
 */
import { describe, expect, it } from 'vitest';
import { VisionProvider } from '../src/core.js';
import { ProviderError } from '../src/errors.js';
import { ClaudeVendor } from '../src/providers/claude.js';
import { GeminiVendor } from '../src/providers/gemini.js';
import { OpenAIVendor } from '../src/providers/openai.js';
import { createProvider } from '../src/factory.js';
import { noiseJpeg, REJECT_RAW as REJECT, replayFetch, type Recorded } from './helpers.js';

const noRetry = { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 };
const twoTries = { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} };

type Json = Record<string, unknown>;
const body = (c: Recorded | undefined): Json => (c?.body ?? {}) as Json;

describe('adapters (recorded HTTP)', async () => {
  const image = { data: await noiseJpeg(2400, 1800), mediaType: 'image/jpeg' as const };
  const req = { image, category: 'duct' as const };

  it('claude: structured output, two cache breakpoints, usage incl. cache, refusal fallback beta', async () => {
    const { fetch, calls } = replayFetch([
      {
        status: 200,
        body: {
          id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: JSON.stringify(REJECT) }],
          stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: 1700, output_tokens: 210, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
        },
      },
    ]);
    const p = new VisionProvider(new ClaudeVendor({ apiKey: 'test', fetch }), { retry: noRetry });
    const { result, meta } = await p.analyze(req);
    expect(result.snags[0]?.code).toBe('DUCT_COVER_OPEN');
    expect(meta).toMatchObject({ provider: 'claude', model: 'claude-sonnet-5-5', inputTokens: 10_700, outputTokens: 210 });
    // 1700*2 + 9000*0.2 + 210*10 = 3400 + 1800 + 2100 = 7300 micro-USD
    expect(meta.costUsd).toBeCloseTo(0.0073, 10);

    const b = body(calls[0]);
    expect(calls[0]?.url).toMatch(/\/v1\/messages/);
    expect(calls[0]?.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(b.fallbacks).toBe('default');
    expect(b.model).toBe('claude-sonnet-5-5');
    const oc = b.output_config as Json;
    expect((oc.format as Json).type).toBe('json_schema');
    expect(oc.effort).toBe('medium');
    const system = b.system as Json[];
    expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    const content = ((b.messages as Json[])[0]?.content ?? []) as Json[];
    expect(content.map((c) => c.type)).toEqual(['text', 'image', 'text']);
    expect(content[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(content[1]?.cache_control).toBeUndefined();
    expect((content[1]?.source as Json).media_type).toBe('image/jpeg');
  });

  it('claude haiku: no effort, no fallback beta', () => {
    const v = new ClaudeVendor({ apiKey: 't', model: 'claude-haiku-4-5' });
    const params = v.buildParams({
      parts: { system: 's', categoryBlock: 'c', fewShot: [], photo: { data: Buffer.alloc(0), mediaType: 'image/jpeg', width: 1, height: 1, base64: '' }, photoText: 't', promptVersion: 'v' },
    });
    expect(params.output_config?.effort).toBeUndefined();
    expect(params.betas).toBeUndefined();
  });

  it('claude: 429 with retry-after is retried, refusal is surfaced', async () => {
    const { fetch, calls } = replayFetch([
      { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow' } }, headers: { 'retry-after': '0' } },
      { status: 200, body: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: 'refusal', stop_sequence: null, stop_details: { type: 'refusal', category: null, explanation: 'declined' }, usage: { input_tokens: 1, output_tokens: 0 } } },
    ]);
    const p = new VisionProvider(new ClaudeVendor({ apiKey: 'test', fetch }), { retry: twoTries });
    await expect(p.analyze(req)).rejects.toMatchObject({ kind: 'refusal' });
    expect(calls).toHaveLength(2);
  });

  it('gemini: responseJsonSchema, systemInstruction, usage with cached and thought tokens', async () => {
    const { fetch, calls } = replayFetch([
      {
        status: 200,
        body: {
          candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ ...REJECT, detectedCategory: undefined }) }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 11_000, cachedContentTokenCount: 8000, candidatesTokenCount: 200, thoughtsTokenCount: 300 },
          modelVersion: 'gemini-3.8-flash',
        },
      },
    ]);
    const p = new VisionProvider(new GeminiVendor({ apiKey: 'test', fetch }), { retry: noRetry });
    const { result, meta } = await p.analyze(req);
    expect(result.verdict).toBe('reject');
    expect(meta.model).toBe('gemini-3.8-flash');
    expect(meta.outputTokens).toBe(500);
    // 3000*0.75 + 8000*0.075 + 500*3.75 = 2250 + 600 + 1875 = 4725 micro-USD
    expect(meta.costUsd).toBeCloseTo(0.004725, 10);
    expect(calls[0]?.url).toContain('gemini-3.8-flash:generateContent');
    const b = body(calls[0]);
    const cfg = (b.generationConfig ?? b.config ?? {}) as Json;
    expect(cfg.responseMimeType).toBe('application/json');
    expect(cfg.responseJsonSchema).toBeDefined();
    expect(JSON.stringify(b.systemInstruction)).toContain('site-acceptance inspector');
    const parts = ((b.contents as Json[])[0]?.parts ?? []) as Json[];
    expect(parts.filter((x) => 'inlineData' in x)).toHaveLength(1);
  });

  it('gemini: 503 maps to a retryable server error', async () => {
    const { fetch } = replayFetch([{ status: 503, body: { error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } } }]);
    const err = await new GeminiVendor({ apiKey: 't', fetch })
      .complete({ parts: { system: 's', categoryBlock: 'c', fewShot: [], photo: { data: Buffer.alloc(0), mediaType: 'image/jpeg', width: 1, height: 1, base64: '' }, photoText: 't', promptVersion: 'v' } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe('server');
    expect((err as ProviderError).retryable).toBe(true);
  });

  it('openai: strict json_schema, data-URL image, cached tokens, repair turn after invalid output', async () => {
    const response = (text: string) => ({
      id: 'resp_1', object: 'response', created_at: 1, model: 'gpt-6.1-sol', status: 'completed',
      output: [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }],
      usage: { input_tokens: 9000, input_tokens_details: { cached_tokens: 6000 }, output_tokens: 150, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 9150 },
    });
    const valid = { ...REJECT, detectedCategory: null, snags: [{ ...REJECT.snags[0], bbox: null }] };
    const { fetch, calls } = replayFetch([
      { status: 200, body: response('{"categoryMatches": true}') },
      { status: 200, body: response(JSON.stringify(valid)) },
    ]);
    const p = new VisionProvider(new OpenAIVendor({ apiKey: 'test', fetch }), { retry: noRetry });
    const { result, meta } = await p.analyze(req);
    expect(result.snags[0]?.bbox).toEqual({ x: 0, y: 0, w: 1, h: 1 }); // missing bbox -> whole frame
    expect(meta.repaired).toBe(true);
    expect(meta.inputTokens).toBe(18_000);
    expect(calls).toHaveLength(2);
    const b = body(calls[0]);
    expect(calls[0]?.url).toMatch(/\/responses$/);
    const fmt = (b.text as Json).format as Json;
    expect(fmt).toMatchObject({ type: 'json_schema', strict: true, name: 'analysis_result' });
    const content = ((b.input as Json[])[0]?.content ?? []) as Json[];
    expect(String(content.find((c) => c.type === 'input_image')?.image_url)).toMatch(/^data:image\/jpeg;base64,/);
    const repairInput = body(calls[1]).input as Json[];
    expect(repairInput.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('image is downscaled before sending (longest side <= 1568)', async () => {
    const { fetch, calls } = replayFetch([{ status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(REJECT) }] } }], usageMetadata: {} } }]);
    await new VisionProvider(new GeminiVendor({ apiKey: 't', fetch }), { retry: noRetry }).analyze(req);
    const parts = ((body(calls[0]).contents as Json[])[0]?.parts ?? []) as Json[];
    const b64 = String(((parts.find((x) => 'inlineData' in x)?.inlineData ?? {}) as Json).data);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1568);
  });

  it('factory builds every provider', () => {
    for (const n of ['claude', 'gemini', 'openai', 'fake'] as const) expect(createProvider(n, { claude: { apiKey: 'x' }, gemini: { apiKey: 'x' }, openai: { apiKey: 'x' } }).name).toBe(n);
    expect(createProvider('gemini', { model: 'gemini-3.5-flash', gemini: { apiKey: 'x' } }).model).toBe('gemini-3.5-flash');
  });
});
