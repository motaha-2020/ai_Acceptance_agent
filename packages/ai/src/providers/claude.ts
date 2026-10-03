/**
 * Anthropic Claude adapter (@anthropic-ai/sdk).
 * - Strict JSON via structured outputs (`output_config.format` json_schema), re-validated with zod.
 * - Prompt caching: breakpoint 1 on the shared system prefix, breakpoint 2 after the category block /
 *   few-shot images, so only the photo and its short text are uncached per request.
 * - Thinking: Opus 5.5 / Sonnet 5.5 run adaptive thinking by default (it cannot be disabled on Opus 5.5);
 *   depth is controlled with `effort`. Haiku 4.5 does not accept `effort`, so it is omitted there.
 * - Refusal fallback: for Opus 5.5 / Sonnet 5.5 the server-side `fallbacks: "default"` beta is enabled
 *   by default, so a safety-classifier decline is re-run on a fallback model inside the same call.
 * - SDK retries are disabled; the shared core does retries/backoff uniformly for all vendors.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ProviderError, kindFromStatus, parseRetryAfter } from '../errors.js';
import { repairInstruction } from '../parse.js';
import { toClaudeSchema, type JsonSchema } from '../schema.js';
import type { VendorClient, VendorReply, VendorRequest } from '../core.js';

export const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5'] as const;
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-5-5';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeOptions {
  apiKey?: string;
  model?: string;
  /** Ignored for Haiku 4.5. Default "medium". */
  effort?: ClaudeEffort;
  maxTokens?: number;
  timeoutMs?: number;
  /** Server-side refusal fallback; default true for models that support it. */
  refusalFallback?: boolean;
  /** Injected fetch (tests use recorded responses). */
  fetch?: typeof fetch;
  baseURL?: string;
}

const supportsEffort = (model: string): boolean => !model.startsWith('claude-haiku');
const supportsFallback = (model: string): boolean => /^claude-(opus|sonnet)-5-5/.test(model);

export class ClaudeVendor implements VendorClient {
  readonly vendor = 'claude';
  readonly model: string;
  private readonly client: Anthropic;
  private readonly schema: JsonSchema = toClaudeSchema();

  constructor(private readonly opts: ClaudeOptions = {}) {
    this.model = opts.model ?? CLAUDE_DEFAULT_MODEL;
    this.client = new Anthropic({
      apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: opts.timeoutMs ?? 120_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  /** Request body; exported for tests and for inspecting cache layout. */
  buildParams(req: VendorRequest): Anthropic.Beta.MessageCreateParamsNonStreaming {
    const { parts } = req;
    const ephemeral = { type: 'ephemeral' } as const;
    const cachedPrefix: Array<Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam> = [{ type: 'text', text: parts.categoryBlock }];
    for (const ex of parts.fewShot) {
      cachedPrefix.push({ type: 'text', text: ex.text });
      cachedPrefix.push({ type: 'image', source: { type: 'base64', media_type: ex.image.mediaType, data: ex.image.base64 } });
    }
    const last = cachedPrefix[cachedPrefix.length - 1];
    if (last) last.cache_control = ephemeral;

    const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
      ...cachedPrefix,
      { type: 'image', source: { type: 'base64', media_type: parts.photo.mediaType, data: parts.photo.base64 } },
      { type: 'text', text: parts.photoText },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userContent }];
    if (req.repair) {
      messages.push({ role: 'assistant', content: req.repair.previousOutput || '(empty)' });
      messages.push({ role: 'user', content: repairInstruction(req.repair.error) });
    }
    const fallback = (this.opts.refusalFallback ?? true) && supportsFallback(this.model);
    return {
      model: this.model,
      max_tokens: this.opts.maxTokens ?? 16_000,
      system: [{ type: 'text', text: parts.system, cache_control: ephemeral }],
      messages,
      output_config: {
        format: { type: 'json_schema', schema: this.schema },
        ...(supportsEffort(this.model) ? { effort: this.opts.effort ?? 'medium' } : {}),
      },
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    };
  }

  async complete(req: VendorRequest): Promise<VendorReply> {
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await this.client.beta.messages.create(this.buildParams(req));
    } catch (err) {
      throw toProviderError(err);
    }
    if (msg.stop_reason === 'refusal') {
      throw new ProviderError(this.vendor, 'refusal', msg.stop_details?.explanation ?? 'model declined');
    }
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    if (msg.stop_reason === 'max_tokens' && !text) {
      throw new ProviderError(this.vendor, 'invalid_output', 'max_tokens reached before any output');
    }
    const u = msg.usage;
    return {
      text,
      model: msg.model,
      usage: {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

function toProviderError(err: unknown): ProviderError {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('claude', 'timeout', err.message, { cause: err });
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError('claude', 'network', err.message, { cause: err });
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : undefined;
    // 529 "overloaded" maps to server (retryable) via the >=500 rule.
    return new ProviderError('claude', kindFromStatus(status), err.message, {
      status,
      retryAfterMs: parseRetryAfter(err.headers?.get?.('retry-after')),
      cause: err,
    });
  }
  return new ProviderError('claude', 'unknown', err instanceof Error ? err.message : String(err), { cause: err });
}
