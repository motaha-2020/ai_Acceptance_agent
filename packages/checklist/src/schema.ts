import { z } from 'zod';
import { AnalysisResult, PhotoCategory, Severity } from '@acceptance/shared';

/** Photo-quality flags understood by the AnalysisResult contract. */
export const QualityIssue = AnalysisResult.shape.qualityIssues.element;
export type QualityIssue = z.infer<typeof QualityIssue>;

/** Stable UPPER_SNAKE code. Never rename a published code; deprecate and add a new one. */
export const SnagCode = z.string().regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/, 'UPPER_SNAKE with at least two parts');

export const SnagGroup = z.enum([
  'photo_quality',
  'housekeeping',
  'fiber',
  'duct_tray',
  'floor_rack',
  'labels',
  'power',
  'cabling',
  'documentation',
  'other',
]);
export type SnagGroup = z.infer<typeof SnagGroup>;

/** Where a code came from, so reviewers know which ones are evidence-backed. */
export const SnagOrigin = z.enum(['snag_docs', 'sid_checklist', 'photo_quality', 'catch_all']);
export type SnagOrigin = z.infer<typeof SnagOrigin>;

const nonEmpty = z.string().trim().min(1);
/** Must contain at least one Arabic letter. */
const arabic = nonEmpty.regex(/[؀-ۿ]/, 'must contain Arabic text');

export const SnagDefinition = z.object({
  code: SnagCode,
  group: SnagGroup,
  origin: SnagOrigin,
  titleEn: nonEmpty,
  titleAr: arabic,
  descriptionEn: nonEmpty,
  descriptionAr: arabic,
  defaultSeverity: Severity,
  categories: z.array(PhotoCategory).min(1),
  /** Concrete things the vision model should look for. */
  visualCues: z.array(nonEmpty).min(1),
  /** Codes that are easy to confuse with this one; the description says how to choose. */
  confusableWith: z.array(SnagCode),
  /** Verbatim reviewer remarks (from the snag Word files) that map to this code. */
  reviewerPhrasesAr: z.array(arabic),
  /** If set, the model must also put this flag in AnalysisResult.qualityIssues. */
  qualityIssue: QualityIssue.optional(),
  fixInstructionAr: arabic,
  fixInstructionEn: nonEmpty,
});
export type SnagDefinition = z.infer<typeof SnagDefinition>;

export const RequiredShot = z.object({
  id: nonEmpty,
  descriptionEn: nonEmpty,
  descriptionAr: arabic,
});
export type RequiredShot = z.infer<typeof RequiredShot>;

export const AcceptanceCriterion = z.object({
  /** e.g. RACK-01; stable, used in review UI and eval reports. */
  id: z.string().regex(/^[A-Z_]+-\d{2}$/),
  textEn: nonEmpty,
  textAr: arabic,
  /** Snag codes emitted when this criterion fails. */
  guardsCodes: z.array(SnagCode).min(1),
  /** Matching line of the SID "Acceptance check list" when there is one. */
  sidRef: z.string().optional(),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

export const CategoryChecklist = z.object({
  category: PhotoCategory,
  titleEn: nonEmpty,
  titleAr: arabic,
  /** What the photo is for, one sentence. */
  purposeEn: nonEmpty,
  /** Folder names seen in the raw site data for this category (hint only; ingest owns the mapping). */
  folderAliases: z.array(nonEmpty),
  requiredShots: z.array(RequiredShot).min(1),
  acceptanceCriteria: z.array(AcceptanceCriterion).min(1),
  /** What an accepted photo looks like, from the approved site photos. */
  goodExampleNotes: z.array(nonEmpty).min(1),
});
export type CategoryChecklist = z.infer<typeof CategoryChecklist>;
