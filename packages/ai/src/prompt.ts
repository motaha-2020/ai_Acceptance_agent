/**
 * Vendor-neutral prompt assembly. Layout (most stable first, so vendors can cache the prefix):
 *   1. system   = checklist shared prefix + photo-gate instructions  (identical for every photo)
 *   2. category = checklist category block                          (changes per category)
 *   3. few-shot = optional reference images for that category       (changes per category)
 *   ---- cache boundary ----
 *   4. photo + per-photo text (site context, local quality measurements)
 */
import type { AnalysisRequest, PhotoCategory } from '@acceptance/shared';
import { buildCategoryPrompt, fnv1a } from '@acceptance/checklist';
import { prepareImage, type ImagePrepOptions, type PreparedImage } from './image.js';
import type { QualityReport } from './quality.js';

/** Template version of the text this module adds on top of the checklist prompt. Bump on any change. */
export const ADAPTER_PROMPT_VERSION = 'ai.1';

/**
 * T3.2 photo gate, evaluated by the model before the checklist. Local pixel checks (blur/dark) run
 * before the call; person-in-frame and wrong-category can only be judged by the model.
 */
export const PHOTO_GATE_INSTRUCTIONS = [
  '# Step 1 - photo gate (do this before the checklist)',
  '- PERSON_IN_FRAME: if a person, face or body (arm, leg, torso) is visible anywhere in the frame, emit PERSON_IN_FRAME and add "person_in_frame" to qualityIssues. Exception: fingers or a hand only holding a label or cable flat for a close-up are normal and are NOT a snag.',
  '- WRONG_CATEGORY: decide which category id from the category list best describes the main subject. If it is not the declared category (and not a close-up of an item that belongs to the declared category), set categoryMatches=false, detectedCategory=<that id>, emit WRONG_CATEGORY, verdict "reject", and skip Step 2.',
  '- PHOTO_BLURRY / PHOTO_TOO_DARK: emit only when the defect prevents judging the checklist (text on labels unreadable, cable routing not distinguishable). Mild softness or dim but readable light is acceptable.',
  '- Local measurements may be supplied with the photo. They are hints from a pixel statistic, not proof: confirm them visually.',
  '',
  '# Step 2 - checklist',
  'Apply the declared category checklist below to the photo. Reference example images, when present, illustrate the standard; never report defects seen only in a reference example.',
].join('\n');

export interface FewShotExample {
  /** Stable id (e.g. sha256 of the image) - used for caching and the prompt version. */
  id: string;
  category: PhotoCategory;
  kind: 'good' | 'snag';
  image: { data: Uint8Array; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
  /** Expected codes for a snag example; empty for good examples. */
  codes: readonly string[];
  /** Optional reviewer note, e.g. the original Arabic remark. */
  note?: string;
}

/** Few-shot examples by category; return [] for none. */
export type FewShotSource = (category: PhotoCategory) => readonly FewShotExample[];

export interface PreparedFewShot {
  text: string;
  image: PreparedImage;
}

export interface PromptParts {
  system: string;
  categoryBlock: string;
  fewShot: PreparedFewShot[];
  photo: PreparedImage;
  photoText: string;
  promptVersion: string;
}

export function fewShotLabel(ex: FewShotExample, index: number): string {
  const head =
    ex.kind === 'good'
      ? `Reference example ${index + 1} (NOT the photo to inspect): an ACCEPTED ${ex.category} photo.`
      : `Reference example ${index + 1} (NOT the photo to inspect): a REJECTED ${ex.category} photo with snag codes ${ex.codes.join(', ') || 'OTHER_SNAG'}.`;
  return ex.note ? `${head} Reviewer remark: ${ex.note}` : head;
}

export function photoText(req: AnalysisRequest, quality?: QualityReport): string {
  const lines = ['The photo to inspect is attached above.'];
  const ctx = req.context;
  if (ctx?.deviceModel || ctx?.hostname) {
    lines.push(`Site context: ${[ctx.deviceModel && `device model ${ctx.deviceModel}`, ctx.hostname && `expected hostname ${ctx.hostname}`].filter(Boolean).join(', ')}.`);
  }
  if (quality) {
    const m = quality.metrics;
    const flags = quality.issues.length ? `possible issues: ${quality.issues.join(', ')}` : 'no issues flagged';
    lines.push(`Local measurements: sharpness (Laplacian variance) ${m.laplacianVariance.toFixed(0)}, mean brightness ${m.meanLuminance.toFixed(0)}/255 - ${flags}.`);
  }
  lines.push('Return the JSON object now.');
  return lines.join('\n');
}

const fewShotCache = new Map<string, Promise<PreparedImage>>();

/** Few-shot images are downscaled harder than the photo itself (they only illustrate the standard). */
async function prepareFewShot(examples: readonly FewShotExample[], maxSide: number): Promise<PreparedFewShot[]> {
  return Promise.all(
    examples.map(async (ex, i) => {
      const key = `${ex.id}@${maxSide}`;
      let img = fewShotCache.get(key);
      if (!img) {
        img = prepareImage(ex.image.data, { maxSide, quality: 80 });
        fewShotCache.set(key, img);
      }
      return { text: fewShotLabel(ex, i), image: await img };
    }),
  );
}

export interface BuildPromptOptions {
  image: ImagePrepOptions;
  fewShot?: FewShotSource;
  fewShotMaxSide?: number;
  quality?: QualityReport;
}

export async function buildPromptParts(req: AnalysisRequest, opts: BuildPromptOptions): Promise<PromptParts> {
  const base = buildCategoryPrompt(req.category);
  const examples = opts.fewShot?.(req.category) ?? [];
  const [photo, fewShot] = await Promise.all([
    prepareImage(req.image.data, opts.image),
    prepareFewShot(examples, opts.fewShotMaxSide ?? 768),
  ]);
  const fsTag = examples.length ? `+fs:${fnv1a(examples.map((e) => e.id).join(','))}` : '';
  return {
    system: `${base.prefix}\n\n${PHOTO_GATE_INSTRUCTIONS}`,
    categoryBlock: base.categoryBlock,
    fewShot,
    photo,
    photoText: photoText(req, opts.quality),
    promptVersion: `${base.promptVersion}+${ADAPTER_PROMPT_VERSION}.${fnv1a(PHOTO_GATE_INSTRUCTIONS)}${fsTag}`,
  };
}
