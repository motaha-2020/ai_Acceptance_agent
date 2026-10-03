/**
 * Google Gemini adapter (official @google/genai SDK).
 * - JSON output via `responseMimeType: application/json` + `responseJsonSchema`; re-validated with zod.
 * - Caching: Gemini applies implicit prefix caching; the shared prefix is the `systemInstruction` and the
 *   category block / few-shot images lead the user turn, so repeated photos of a category share a prefix.
 * - `thinkingLevel` is configurable (Gemini 3.x); left to the model default when unset.
 * - SDK retries are disabled (attempts: 1); the shared core retries uniformly.
 */
import { ApiError, GoogleGenAI, type Content, type GenerateContentParameters, type Part, type ThinkingLevel } from '@google/genai';
import { ProviderError, kindFromStatus } from '../errors.js';
import { repairInstruction } from '../parse.js';
import { toGeminiSchema, type JsonSchema } from '../schema.js';
import type { VendorClient, VendorReply, VendorRequest } from '../core.js';

/** Flash-class default (cheapest strong vision tier at time of writing; verify on the pricing page). */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';

export interface GeminiOptions {
  apiKey?: string;
  model?: string;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class GeminiVendor implements VendorClient {
  readonly vendor = 'gemini';
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly schema: JsonSchema = toGeminiSchema();

  constructor(private readonly opts: GeminiOptions = {}) {
    this.model = opts.model ?? GEMINI_DEFAULT_MODEL;
    this.client = new GoogleGenAI({
      apiKey: opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
      httpOptions: {
        timeout: opts.timeoutMs ?? 120_000,
        retryOptions: { attempts: 1 },
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
      },
    });
  }

  buildParams(req: VendorRequest): GenerateContentParameters {
    const { parts } = req;
    const userParts: Part[] = [{ text: parts.categoryBlock }];
    for (const ex of parts.fewShot) {
      userParts.push({ text: ex.text });
      userParts.push({ inlineData: { mimeType: ex.image.mediaType, data: ex.image.base64 } });
    }
    userParts.push({ inlineData: { mimeType: parts.photo.mediaType, data: parts.photo.base64 } });
    userParts.push({ text: parts.photoText });
    const contents: Content[] = [{ role: 'user', parts: userParts }];
    if (req.repair) {
      contents.push({ role: 'model', parts: [{ text: req.repair.previousOutput || '(empty)' }] });
      contents.push({ role: 'user', parts: [{ text: repairInstruction(req.repair.error) }] });
    }
    return {
      model: this.model,
      contents,
      config: {
        systemInstruction: parts.system,
        responseMimeType: 'application/json',
        responseJsonSchema: req.responseSchema ? toGeminiSchema(req.responseSchema.schema) : this.schema,
        maxOutputTokens: this.opts.maxOutputTokens ?? 8192,
        temperature: this.opts.temperature ?? 0,
        ...(this.opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: this.opts.thinkingLevel.toUpperCase() as ThinkingLevel } } : {}),
      },
    };
  }

  async complete(req: VendorRequest): Promise<VendorReply> {
    let res;
    try {
      res = await this.client.models.generateContent(this.buildParams(req));
    } catch (err) {
      throw toProviderError(err);
    }
    const blocked = res.promptFeedback?.blockReason;
    if (blocked) throw new ProviderError(this.vendor, 'refusal', `prompt blocked: ${blocked}`);
    const finish = res.candidates?.[0]?.finishReason;
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'RECITATION') {
      throw new ProviderError(this.vendor, 'refusal', `finishReason ${finish}`);
    }
    const u = res.usageMetadata;
    const cached = u?.cachedContentTokenCount ?? 0;
    return {
      text: res.text ?? '',
      model: res.modelVersion ?? this.model,
      usage: {
        inputTokens: Math.max(0, (u?.promptTokenCount ?? 0) - cached),
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
        // thinking tokens are billed at the output rate
        outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
      },
    };
  }
}

function toProviderError(err: unknown): ProviderError {
  if (err instanceof ApiError) return new ProviderError('gemini', kindFromStatus(err.status), err.message, { status: err.status, cause: err });
  const msg = err instanceof Error ? err.message : String(err);
  const kind = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError' || /timed? ?out/i.test(msg)) ? 'timeout' : 'network';
  return new ProviderError('gemini', kind, msg, { cause: err });
}
