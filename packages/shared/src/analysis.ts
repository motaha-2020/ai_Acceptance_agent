import { z } from 'zod';
import { PhotoCategory, Severity, Verdict } from './enums.js';

/** Normalised bounding box, 0..1 relative to image size. */
export const BBox = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const SnagFinding = z.object({
  code: z.string(), // taxonomy code, e.g. LABEL_MISSING
  severity: Severity,
  bbox: BBox.optional(),
  reasonAr: z.string(),
  reasonEn: z.string(),
});
export type SnagFinding = z.infer<typeof SnagFinding>;

/** Contract every AI provider adapter must return. */
export const AnalysisResult = z.object({
  categoryMatches: z.boolean(),
  detectedCategory: PhotoCategory.optional(),
  qualityIssues: z.array(z.enum(['blurry', 'dark', 'person_in_frame', 'wrong_subject'])),
  verdict: Verdict,
  confidence: z.number().min(0).max(1),
  snags: z.array(SnagFinding),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;
