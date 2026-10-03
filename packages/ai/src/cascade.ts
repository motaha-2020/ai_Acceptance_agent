/**
 * Cascade: a cheap provider answers first; the strong provider re-inspects only photos where the
 * cheap answer is not trustworthy. This is the intended production setup (thresholds come from T3.6).
 */
import type { AnalysisMeta, AnalysisProvider, AnalysisRequest, AnalysisResult } from '@acceptance/shared';
import { ProviderError } from './errors.js';

export type EscalationReason = 'error' | 'uncertain' | 'low_confidence' | 'category_mismatch' | 'quality_issue';

export interface CascadePolicy {
  /** Escalate when the first verdict's confidence is below this. */
  minConfidence: number;
  escalateOnUncertain: boolean;
  /** Wrong-category is a costly retake request; let the strong model confirm it. */
  escalateOnCategoryMismatch: boolean;
  /** Escalate when the first provider reports a photo-quality issue (blurry/dark/person). */
  escalateOnQualityIssue: boolean;
  /** Escalate when the first provider fails (after its own retries). */
  escalateOnError: boolean;
}

export const DEFAULT_CASCADE_POLICY: CascadePolicy = {
  minConfidence: 0.7,
  escalateOnUncertain: true,
  escalateOnCategoryMismatch: true,
  escalateOnQualityIssue: false,
  escalateOnError: true,
};

export interface CascadeStage {
  provider: string;
  model: string;
  latencyMs: number;
  costUsd?: number;
  verdict?: AnalysisResult['verdict'];
  confidence?: number;
  error?: string;
}

export interface CascadeMeta extends AnalysisMeta {
  escalated: boolean;
  escalationReasons: EscalationReason[];
  stages: CascadeStage[];
}

/** Pure decision function (unit-tested separately). */
export function escalationReasons(result: AnalysisResult, policy: CascadePolicy): EscalationReason[] {
  const reasons: EscalationReason[] = [];
  if (policy.escalateOnUncertain && result.verdict === 'uncertain') reasons.push('uncertain');
  if (result.confidence < policy.minConfidence) reasons.push('low_confidence');
  if (policy.escalateOnCategoryMismatch && !result.categoryMatches) reasons.push('category_mismatch');
  if (policy.escalateOnQualityIssue && result.qualityIssues.length > 0) reasons.push('quality_issue');
  return reasons;
}

const sum = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

export class CascadeProvider implements AnalysisProvider {
  readonly name: string;
  readonly policy: CascadePolicy;

  constructor(
    private readonly first: AnalysisProvider,
    private readonly second: AnalysisProvider,
    policy: Partial<CascadePolicy> = {},
  ) {
    this.policy = { ...DEFAULT_CASCADE_POLICY, ...policy };
    this.name = `cascade(${first.name}->${second.name})`;
  }

  async analyze(req: AnalysisRequest): Promise<{ result: AnalysisResult; meta: CascadeMeta }> {
    let firstOut: { result: AnalysisResult; meta: AnalysisMeta } | undefined;
    let firstStage: CascadeStage;
    try {
      firstOut = await this.first.analyze(req);
      firstStage = stage(firstOut.meta, firstOut.result);
    } catch (err) {
      if (!this.policy.escalateOnError) throw err;
      firstStage = { provider: this.first.name, model: '?', latencyMs: 0, error: errMessage(err) };
    }

    const reasons: EscalationReason[] = firstOut ? escalationReasons(firstOut.result, this.policy) : ['error'];
    if (firstOut && reasons.length === 0) {
      return { result: firstOut.result, meta: { ...firstOut.meta, escalated: false, escalationReasons: [], stages: [firstStage] } };
    }

    try {
      const secondOut = await this.second.analyze(req);
      const stages = [firstStage, stage(secondOut.meta, secondOut.result)];
      return { result: secondOut.result, meta: combine(secondOut.meta, firstOut?.meta, stages, reasons) };
    } catch (err) {
      if (!firstOut) throw err instanceof ProviderError ? err : new ProviderError(this.name, 'unknown', errMessage(err), { cause: err });
      // Strong model failed: keep the cheap answer but never let it auto-accept.
      const stages = [firstStage, { provider: this.second.name, model: '?', latencyMs: 0, error: errMessage(err) }];
      const result: AnalysisResult = firstOut.result.verdict === 'accept' ? { ...firstOut.result, verdict: 'uncertain' } : firstOut.result;
      return { result, meta: combine(firstOut.meta, undefined, stages, reasons) };
    }
  }
}

function stage(meta: AnalysisMeta, result: AnalysisResult): CascadeStage {
  return { provider: meta.provider, model: meta.model, latencyMs: meta.latencyMs, costUsd: meta.costUsd, verdict: result.verdict, confidence: result.confidence };
}

function combine(final: AnalysisMeta, other: AnalysisMeta | undefined, stages: CascadeStage[], reasons: EscalationReason[]): CascadeMeta {
  return {
    provider: `cascade:${stages.map((s) => s.provider).join('->')}`,
    model: stages.map((s) => s.model).join('->'),
    promptVersion: final.promptVersion,
    inputTokens: sum(final.inputTokens, other?.inputTokens),
    outputTokens: sum(final.outputTokens, other?.outputTokens),
    latencyMs: stages.reduce((t, s) => t + s.latencyMs, 0),
    costUsd: sum(final.costUsd, other?.costUsd),
    escalated: true,
    escalationReasons: reasons,
    stages,
  };
}

const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
