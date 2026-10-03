/**
 * T3.5 decision layer: the model reports what it SEES (snags with evidence, bbox and a per-snag
 * confidence, plus its own verdict); a deterministic, versioned policy turns that into the contract's
 * AnalysisResult verdict. Separating perception from decision lets the eval re-score a recorded run
 * under a different policy offline (no API spend) and keeps the business rules reviewable in one place.
 *
 * Rules (defaults from SITE_DECISIONS in @acceptance/checklist):
 *  1. A snag below its report threshold (policy.reportConfidence, or the code's own higher minimum for
 *     SID-derived codes) is dropped.
 *  2. Severity is the taxonomy default for the code (the model cannot inflate it); critical only for the
 *     codes the taxonomy marks critical.
 *  3. Major/critical snags with confidence >= rejectConfidence reject the photo.
 *  4. Otherwise route-to-human codes (WRONG_CATEGORY, SUBJECT_NOT_FULLY_VISIBLE), a major snag below the
 *     reject threshold, or the model's own "uncertain" -> uncertain.
 *  5. Otherwise only minor snags -> SITE_DECISIONS.minorOnlyVerdict (default accept with notes);
 *     no snags -> the model's verdict, where a "reject" without any snag becomes "uncertain".
 */
import { AnalysisResult, BBox, PhotoCategory, Severity as SeveritySchema, type SnagFinding } from '@acceptance/shared';
import { codeMinConfidence, getSnag, isRelatedCategory, SITE_DECISIONS } from '@acceptance/checklist';
import { z } from 'zod';

type Severity = z.infer<typeof SeveritySchema>;

/** One snag as the model reports it (a superset of the contract's SnagFinding). */
export const ModelSnag = z.object({
  code: z.string(),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  bbox: BBox,
  reasonAr: z.string(),
  reasonEn: z.string(),
});
export type ModelSnag = z.infer<typeof ModelSnag>;

/** What the vision model returns (validated with zod; the vendor JSON schema is derived from it). */
export const ModelOutput = z.object({
  categoryMatches: z.boolean(),
  detectedCategory: PhotoCategory.optional(),
  qualityIssues: AnalysisResult.shape.qualityIssues,
  verdict: AnalysisResult.shape.verdict,
  confidence: z.number().min(0).max(1),
  snags: z.array(ModelSnag),
});
export type ModelOutput = z.infer<typeof ModelOutput>;

export interface VerdictPolicy {
  /** Version tag stored in promptVersion; bump on any rule or threshold change. */
  version: string;
  /** Minor snags below this confidence are dropped (not reported). */
  reportConfidence: number;
  /** Major/critical snags below this confidence are dropped; between this and rejectConfidence they route to a human. */
  routeConfidence: number;
  /** A clean accept needs the model verdict confidence >= this; otherwise the photo is uncertain. */
  acceptConfidence: number;
  /** Major/critical snags at or above this confidence reject; below it they make the photo uncertain. */
  rejectConfidence: number;
  minorOnlyVerdict: 'accept' | 'uncertain' | 'reject';
  routeToHumanCodes: readonly string[];
  /** Use the taxonomy default severity instead of the model's. */
  useTaxonomySeverity: boolean;
  /** WRONG_CATEGORY between related categories (D6) is dropped as a model error. */
  ignoreRelatedCategoryMismatch: boolean;
}

export const DEFAULT_VERDICT_POLICY: VerdictPolicy = {
  version: 'vp2',
  reportConfidence: 0.5,
  routeConfidence: 0.35,
  acceptConfidence: 0,
  rejectConfidence: 0.7,
  minorOnlyVerdict: SITE_DECISIONS.minorOnlyVerdict,
  routeToHumanCodes: SITE_DECISIONS.routeToHumanCodes,
  useTaxonomySeverity: true,
  ignoreRelatedCategoryMismatch: SITE_DECISIONS.relatedCategoriesAreSameSubject,
};

/** The pre-T3.5 behaviour (any snag rejects, model severities), for replaying old runs. */
export const LEGACY_VERDICT_POLICY: VerdictPolicy = {
  version: 'legacy',
  reportConfidence: 0,
  routeConfidence: 0,
  acceptConfidence: 0,
  rejectConfidence: 0,
  minorOnlyVerdict: 'reject',
  routeToHumanCodes: [],
  useTaxonomySeverity: false,
  ignoreRelatedCategoryMismatch: false,
};

export type DecisionReason =
  | 'blocking_snag'
  | 'route_to_human'
  | 'major_below_reject_confidence'
  | 'model_uncertain'
  | 'minor_only'
  | 'clean'
  | 'low_confidence_accept'
  | 'reject_without_snag';

export interface Decision {
  result: AnalysisResult;
  reason: DecisionReason;
  /** Codes dropped by rule 1 (below report confidence) or as a related-category mismatch. */
  dropped: string[];
}

const SEVERITY_RANK: Record<Severity, number> = { minor: 0, major: 1, critical: 2 };

const WRONG_CATEGORY_SNAG: ModelSnag = {
  code: 'WRONG_CATEGORY',
  severity: 'major',
  confidence: 0.6,
  evidence: 'main subject is not the declared category',
  bbox: { x: 0, y: 0, w: 1, h: 1 },
  reasonAr: 'الصورة مش من نفس البند المطلوب، نصور البند الصح',
  reasonEn: 'Photo does not show the declared category; retake the correct item.',
};

function effectiveSeverity(s: ModelSnag, policy: VerdictPolicy): Severity {
  if (!policy.useTaxonomySeverity) return s.severity;
  return getSnag(s.code)?.defaultSeverity ?? s.severity;
}

function threshold(code: string, severity: Severity, policy: VerdictPolicy): number {
  const base = SEVERITY_RANK[severity] >= 1 ? policy.routeConfidence : policy.reportConfidence;
  return Math.max(base, codeMinConfidence(code) ?? 0);
}

/**
 * Model output -> contract result. `declared` is the category the photo was uploaded under (used for the
 * related-category rule). Deterministic and pure.
 */
export function decideVerdict(out: ModelOutput, declared: PhotoCategory, policy: VerdictPolicy = DEFAULT_VERDICT_POLICY): Decision {
  const dropped: string[] = [];
  let categoryMatches = out.categoryMatches;
  let detectedCategory = out.detectedCategory;
  if (!categoryMatches && policy.ignoreRelatedCategoryMismatch && detectedCategory && isRelatedCategory(declared, detectedCategory)) {
    categoryMatches = true;
    detectedCategory = undefined;
    dropped.push('WRONG_CATEGORY');
  }

  // Dedup (first occurrence wins), consistency with categoryMatches, report threshold.
  const seen = new Set<string>();
  const raw = out.snags.filter((s) => (seen.has(s.code) ? false : (seen.add(s.code), true)));
  if (!categoryMatches && !seen.has('WRONG_CATEGORY')) raw.push(WRONG_CATEGORY_SNAG);
  const kept: Array<ModelSnag & { eff: Severity }> = [];
  for (const s of raw) {
    if (s.code === 'WRONG_CATEGORY' && categoryMatches) {
      if (!dropped.includes(s.code)) dropped.push(s.code);
      continue;
    }
    // WRONG_CATEGORY implied by categoryMatches=false is always kept.
    const eff = effectiveSeverity(s, policy);
    if (s.code !== 'WRONG_CATEGORY' && s.confidence < threshold(s.code, eff, policy)) {
      dropped.push(s.code);
      continue;
    }
    kept.push({ ...s, eff });
  }

  const route = new Set(policy.routeToHumanCodes);
  const serious = kept.filter((s) => SEVERITY_RANK[s.eff] >= 1 && !route.has(s.code));
  const blocking = serious.filter((s) => s.confidence >= policy.rejectConfidence);
  const routed = kept.filter((s) => route.has(s.code));

  let verdict: AnalysisResult['verdict'];
  let reason: DecisionReason;
  if (blocking.length > 0) {
    verdict = 'reject';
    reason = 'blocking_snag';
  } else if (routed.length > 0) {
    verdict = 'uncertain';
    reason = 'route_to_human';
  } else if (serious.length > 0) {
    verdict = 'uncertain';
    reason = 'major_below_reject_confidence';
  } else if (out.verdict === 'uncertain') {
    verdict = 'uncertain';
    reason = 'model_uncertain';
  } else if (kept.length > 0) {
    verdict = policy.minorOnlyVerdict;
    reason = 'minor_only';
  } else if (out.verdict === 'reject') {
    verdict = 'uncertain';
    reason = 'reject_without_snag';
  } else if (out.confidence < policy.acceptConfidence) {
    verdict = 'uncertain';
    reason = 'low_confidence_accept';
  } else {
    verdict = 'accept';
    reason = 'clean';
  }
  // Legacy policy: any reported snag rejects.
  if (policy.minorOnlyVerdict === 'reject' && policy.routeToHumanCodes.length === 0 && kept.length > 0) {
    verdict = 'reject';
    reason = 'blocking_snag';
  }

  const qualityIssues = new Set(out.qualityIssues);
  if (categoryMatches) qualityIssues.delete('wrong_subject');
  else qualityIssues.add('wrong_subject');
  if (!kept.some((s) => s.code === 'PERSON_IN_FRAME')) qualityIssues.delete('person_in_frame');

  const snags: SnagFinding[] = kept.map((s) => ({ code: s.code, severity: s.eff, bbox: s.bbox, reasonAr: s.reasonAr, reasonEn: s.reasonEn }));
  const result: AnalysisResult = {
    categoryMatches,
    ...(categoryMatches || !detectedCategory ? {} : { detectedCategory }),
    qualityIssues: [...qualityIssues],
    verdict,
    confidence: verdictConfidence(out, verdict, blocking),
    snags,
  };
  return { result, reason, dropped };
}

/**
 * Confidence in the final verdict: for a reject the strongest blocking snag, otherwise the model's
 * verdict confidence when the policy agrees with it, or a neutral 0.5 when the policy overrode it.
 */
function verdictConfidence(out: ModelOutput, verdict: AnalysisResult['verdict'], blocking: ModelSnag[]): number {
  if (verdict === 'reject' && blocking.length) return Math.max(...blocking.map((s) => s.confidence));
  if (verdict === out.verdict) return out.confidence;
  return 0.5;
}

/** Contract result -> model output with neutral per-snag fields (tests, fake vendor, legacy records). */
export function toModelOutput(r: AnalysisResult, snagConfidence = 0.8): ModelOutput {
  return {
    categoryMatches: r.categoryMatches,
    ...(r.detectedCategory ? { detectedCategory: r.detectedCategory } : {}),
    qualityIssues: r.qualityIssues,
    verdict: r.verdict,
    confidence: r.confidence,
    snags: r.snags.map((s) => ({ ...s, bbox: s.bbox ?? { x: 0, y: 0, w: 1, h: 1 }, confidence: snagConfidence, evidence: s.reasonEn })),
  };
}
