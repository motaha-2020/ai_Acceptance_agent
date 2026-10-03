/**
 * OpenAI adapter (official `openai` SDK, Responses API).
 * - Structured outputs: `text.format` json_schema with strict=true (all fields required, optional ones
 *   nullable; nulls stripped before zod validation).
 * - Caching: OpenAI caches long identical prefixes automatically; `prompt_cache_key` per category keeps
 *   requests of one category on the same cache shard.
 * - SDK retries are disabled; the shared core retries uniformly.
 */
import OpenAI from 'openai';
import { ProviderError, kindFromStatus, parseRetryAfter } from '../errors.js';
import { repairInstruction } from '../parse.js';
import { toOpenAISchema, type JsonSchema } from '../schema.js';
import type { VendorClient, VendorReply, VendorRequest } from '../core.js';

export const OPENAI_DEFAULT_MODEL = 'gpt-6.1-sol';

export interface OpenAIOptions {
  apiKey?: string;
  model?: string;
  /** Reasoning effort for reasoning models; omitted when unset. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  imageDetail?: 'low' | 'high' | 'auto';
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  baseURL?: string;
}

type InputContent = OpenAI.Responses.ResponseInputMessageContentList;

export class OpenAIVendor implements VendorClient {
  readonly vendor = 'openai';
  readonly model: string;
  private readonly client: OpenAI;
  private readonly schema: JsonSchema = toOpenAISchema();

  constructor(private readonly opts: OpenAIOptions = {}) {
    this.model = opts.model ?? OPENAI_DEFAULT_MODEL;
    this.client = new OpenAI({
      apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: opts.timeoutMs ?? 120_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  buildParams(req: VendorRequest): OpenAI.Responses.ResponseCreateParamsNonStreaming {
    const { parts } = req;
    const detail = this.opts.imageDetail ?? 'high';
    const content: InputContent = [{ type: 'input_text', text: parts.categoryBlock }];
    for (const ex of parts.fewShot) {
      content.push({ type: 'input_text', text: ex.text });
      content.push({ type: 'input_image', detail, image_url: `data:${ex.image.mediaType};base64,${ex.image.base64}` });
    }
    content.push({ type: 'input_image', detail, image_url: `data:${parts.photo.mediaType};base64,${parts.photo.base64}` });
    content.push({ type: 'input_text', text: parts.photoText });
    const input: OpenAI.Responses.ResponseInput = [{ role: 'user', content }];
    if (req.repair) {
      input.push({ role: 'assistant', content: req.repair.previousOutput || '(empty)' });
      input.push({ role: 'user', content: repairInstruction(req.repair.error) });
    }
    return {
      model: this.model,
      instructions: parts.system,
      input,
      text: { format: { type: 'json_schema', name: req.responseSchema?.name ?? 'analysis_result', schema: req.responseSchema ? toOpenAISchema(req.responseSchema.schema) : this.schema, strict: true } },
      max_output_tokens: this.opts.maxOutputTokens ?? 8192,
      prompt_cache_key: `acceptance-${parts.promptVersion}`.slice(0, 64),
      store: false,
      ...(this.opts.reasoningEffort ? { reasoning: { effort: this.opts.reasoningEffort } } : {}),
    };
  }

  async complete(req: VendorRequest): Promise<VendorReply> {
    let res: OpenAI.Responses.Response;
    try {
      res = await this.client.responses.create(this.buildParams(req));
    } catch (err) {
      throw toProviderError(err);
    }
    for (const item of res.output) {
      if (item.type === 'message') {
        for (const c of item.content) if (c.type === 'refusal') throw new ProviderError(this.vendor, 'refusal', c.refusal);
      }
    }
    if (res.status === 'incomplete' && !res.output_text) {
      throw new ProviderError(this.vendor, 'invalid_output', `incomplete: ${res.incomplete_details?.reason ?? 'unknown'}`);
    }
    const u = res.usage;
    const cached = u?.input_tokens_details?.cached_tokens ?? 0;
    return {
      text: res.output_text,
      model: res.model,
      usage: {
        inputTokens: Math.max(0, (u?.input_tokens ?? 0) - cached),
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
        outputTokens: u?.output_tokens ?? 0,
      },
    };
  }
}

function toProviderError(err: unknown): ProviderError {
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new ProviderError('openai', 'timeout', err.message, { cause: err });
  if (err instanceof OpenAI.APIConnectionError) return new ProviderError('openai', 'network', err.message, { cause: err });
  if (err instanceof OpenAI.APIError) {
    const status = typeof err.status === 'number' ? err.status : undefined;
    return new ProviderError('openai', kindFromStatus(status), err.message, {
      status,
      retryAfterMs: parseRetryAfter(err.headers?.get?.('retry-after')),
      cause: err,
    });
  }
  return new ProviderError('openai', 'unknown', err instanceof Error ? err.message : String(err), { cause: err });
}
