/**
 * Shared provider core: quality gate -> prompt assembly -> vendor call (retry/backoff) -> parse/validate
 * -> one repair retry -> cost. Vendor adapters only implement `VendorClient.complete`.
 */
import type { AnalysisMeta, AnalysisProvider, AnalysisRequest, AnalysisResult, SnagFinding } from '@acceptance/shared';
import { getSnag } from '@acceptance/checklist';
import { ProviderError } from './errors.js';
import { DEFAULT_IMAGE_PREP, type ImagePrepOptions } from './image.js';
import { parseAnalysis } from './parse.js';
import { addUsage, costUsd, DEFAULT_PRICES, totalInputTokens, ZERO_USAGE, type PriceTable, type TokenUsage } from './pricing.js';
import { buildPromptParts, type FewShotSource, type PromptParts } from './prompt.js';
import { assessQuality, DEFAULT_QUALITY_THRESHOLDS, type LocalQualityIssue, type QualityReport, type QualityThresholds } from './quality.js';
import { DEFAULT_RETRY, withRetry, type RetryOptions } from './retry.js';

export interface VendorRequest {
  parts: PromptParts;
  /** Set on the single repair attempt after an invalid response. */
  repair?: { previousOutput: string; error: string };
}

export interface VendorReply {
  text: string;
  usage: TokenUsage;
  /** Model id reported by the vendor (may be a dated snapshot of the requested alias). */
  model: string;
}

/** The only thing a vendor adapter has to implement. Must throw ProviderError on failure. */
export interface VendorClient {
  readonly vendor: string;
  readonly model: string;
  complete(req: VendorRequest): Promise<VendorReply>;
}

/**
 * off: no local check. hint: measure and pass the numbers to the model as a hint (default); the
 * local report is returned in meta.quality.
 * short_circuit: if the local gate flags the photo, reject it without calling the vendor (cheapest;
 * enable only once thresholds are validated on real reviewer decisions).
 */
export type QualityGateMode = 'off' | 'hint' | 'short_circuit';

export interface CoreOptions {
  image?: ImagePrepOptions;
  retry?: RetryOptions;
  qualityGate?: { mode?: QualityGateMode; thresholds?: QualityThresholds };
  fewShot?: FewShotSource;
  prices?: PriceTable;
  /** Clock for latency; injected in tests. */
  now?: () => number;
}

/** AnalysisMeta plus diagnostics. Structurally an AnalysisMeta, so it satisfies the shared contract. */
export interface ExtendedMeta extends AnalysisMeta {
  usage: TokenUsage;
  vendorCalls: number;
  repaired: boolean;
  quality?: QualityReport;
  shortCircuited?: boolean;
}

export interface ProviderOutput {
  result: AnalysisResult;
  meta: ExtendedMeta;
}

const LOCAL_CODE: Record<LocalQualityIssue, string> = { blurry: 'PHOTO_BLURRY', dark: 'PHOTO_TOO_DARK' };

export function localQualitySnag(issue: LocalQualityIssue): SnagFinding {
  const def = getSnag(LOCAL_CODE[issue]);
  return {
    code: LOCAL_CODE[issue],
    severity: def?.defaultSeverity ?? 'major',
    reasonAr: def?.fixInstructionAr ?? 'نعيد التصوير',
    reasonEn: def?.fixInstructionEn ?? 'Retake the photo.',
  };
}

export class VisionProvider implements AnalysisProvider {
  readonly name: string;
  private readonly opts: Required<Pick<CoreOptions, 'image' | 'retry' | 'prices' | 'now'>> & CoreOptions;

  constructor(
    private readonly vendor: VendorClient,
    options: CoreOptions = {},
  ) {
    this.name = vendor.vendor;
    this.opts = {
      ...options,
      image: options.image ?? DEFAULT_IMAGE_PREP,
      retry: options.retry ?? DEFAULT_RETRY,
      prices: options.prices ?? DEFAULT_PRICES,
      now: options.now ?? Date.now,
    };
  }

  get model(): string {
    return this.vendor.model;
  }

  async analyze(req: AnalysisRequest): Promise<ProviderOutput> {
    const t0 = this.opts.now();
    const mode = this.opts.qualityGate?.mode ?? 'hint';
    const thresholds = this.opts.qualityGate?.thresholds ?? DEFAULT_QUALITY_THRESHOLDS;
    const quality = mode === 'off' ? undefined : await assessQuality(req.image.data, thresholds);

    if (mode === 'short_circuit' && quality && quality.issues.length > 0) {
      return this.shortCircuit(req, quality, t0);
    }

    const parts = await buildPromptParts(req, {
      image: this.opts.image,
      fewShot: this.opts.fewShot,
      quality: mode === 'hint' ? quality : undefined,
    });
    const call = (r: VendorRequest): Promise<VendorReply> => withRetry(() => this.vendor.complete(r), this.opts.retry);

    let reply = await call({ parts });
    let usage = reply.usage;
    let vendorCalls = 1;
    let parsed = parseAnalysis(reply.text);
    let repaired = false;
    if (!parsed.ok) {
      const first = parsed;
      reply = await call({ parts, repair: { previousOutput: reply.text, error: first.error } });
      usage = addUsage(usage, reply.usage);
      vendorCalls++;
      repaired = true;
      parsed = parseAnalysis(reply.text);
      if (!parsed.ok) throw new ProviderError(this.vendor.vendor, 'invalid_output', `after repair: ${parsed.error}`);
    }

    // The model has the final word on quality; local findings are kept in meta.quality for analysis.
    const result = parsed.result;
    return {
      result,
      meta: {
        provider: this.vendor.vendor,
        model: reply.model,
        promptVersion: parts.promptVersion,
        inputTokens: totalInputTokens(usage),
        outputTokens: usage.outputTokens,
        latencyMs: this.opts.now() - t0,
        costUsd: costUsd(reply.model, usage, this.opts.prices) ?? costUsd(this.vendor.model, usage, this.opts.prices),
        usage,
        vendorCalls,
        repaired,
        quality,
      },
    };
  }

  private shortCircuit(req: AnalysisRequest, quality: QualityReport, t0: number): ProviderOutput {
    return {
      result: {
        categoryMatches: true,
        qualityIssues: [...quality.issues],
        verdict: 'reject',
        confidence: 0.6,
        snags: quality.issues.map(localQualitySnag),
      },
      meta: {
        provider: this.vendor.vendor,
        model: 'local-quality-gate',
        promptVersion: `quality-gate:${req.category}`,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: this.opts.now() - t0,
        costUsd: 0,
        usage: ZERO_USAGE,
        vendorCalls: 0,
        repaired: false,
        quality,
        shortCircuited: true,
      },
    };
  }
}
