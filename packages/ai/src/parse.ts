import { AnalysisResult } from '@acceptance/shared';

export type ParseOutcome = { ok: true; result: AnalysisResult } | { ok: false; error: string };

/** Extracts the JSON object from model text: tolerates ```json fences and prose around the object. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new SyntaxError('no JSON object found in model output');
  }
}

/** Removes null-valued keys (OpenAI strict mode returns null for absent optional fields). */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== null) out[k] = stripNulls(v);
  return out;
}

/**
 * Deterministic post-rules that keep a valid result internally consistent with the prompt rules:
 *  - any snag forces verdict "reject" (reviewers reject for minor remarks too);
 *  - categoryMatches=false implies a WRONG_CATEGORY snag and the `wrong_subject` flag;
 *  - detectedCategory is only kept when the category does not match;
 *  - duplicate codes are collapsed (first occurrence wins); duplicate quality flags removed.
 */
export function normalizeResult(r: AnalysisResult): AnalysisResult {
  const seen = new Set<string>();
  const snags = r.snags.filter((s) => (seen.has(s.code) ? false : (seen.add(s.code), true)));
  const qualityIssues = new Set(r.qualityIssues);
  if (!r.categoryMatches) {
    qualityIssues.add('wrong_subject');
    if (!seen.has('WRONG_CATEGORY')) {
      snags.push({
        code: 'WRONG_CATEGORY',
        severity: 'major',
        reasonAr: 'الصورة مش من نفس البند المطلوب، نصور البند الصح',
        reasonEn: 'Photo does not show the declared category; retake the correct item.',
      });
    }
  }
  const out: AnalysisResult = {
    ...r,
    qualityIssues: [...qualityIssues],
    snags,
    verdict: snags.length > 0 ? 'reject' : r.verdict,
  };
  if (r.categoryMatches) delete out.detectedCategory;
  return out;
}

/** Parse + zod-validate + normalise. Error text is phrased so it can be fed back to the model. */
export function parseAnalysis(text: string): ParseOutcome {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return { ok: false, error: `Output is not valid JSON (${(e as Error).message}).` };
  }
  const parsed = AnalysisResult.safeParse(stripNulls(json));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return { ok: false, error: `Output does not match the schema: ${issues.join('; ')}.` };
  }
  return { ok: true, result: normalizeResult(parsed.data) };
}

export function repairInstruction(error: string): string {
  return `Your previous answer was rejected by the validator. ${error} Return the corrected JSON object only, following the output contract exactly.`;
}
