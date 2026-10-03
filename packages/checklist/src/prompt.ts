import { PhotoCategory } from '@acceptance/shared';
import { CHECKLISTS, getChecklist } from './checklists.js';
import { SNAG_TAXONOMY, TAXONOMY_VERSION, snagsForCategory } from './taxonomy.js';
import { relatedCategories, renderSiteDecisions } from './decisions.js';

/**
 * Prompt text for the vision model. Pure and deterministic (no dates, no randomness,
 * no vendor SDK) so that:
 *  - `prefix` is byte-identical for every category and photo -> cacheable prompt prefix
 *    (system prompt / first content block with cache_control or implicit caching);
 *  - `categoryBlock` changes only with the category -> second cache breakpoint;
 *  - the photo itself goes after both blocks.
 */
export interface CategoryPrompt {
  category: PhotoCategory;
  /** Shared across all categories: role, rules, output contract, full taxonomy. */
  prefix: string;
  /** Category-specific checklist and applicable codes. */
  categoryBlock: string;
  /** prefix + categoryBlock, for providers without multi-block prompts. */
  text: string;
  /** Changes whenever any prompt text changes; store it with every analysis for evals. */
  promptVersion: string;
}

const OUTPUT_CONTRACT = `{
  "categoryMatches": boolean,            // is the main subject the declared category or a related category?
  "detectedCategory": string,            // only when categoryMatches is false: best matching category id
  "qualityIssues": ("blurry"|"dark"|"person_in_frame"|"wrong_subject")[],
  "verdict": "accept" | "reject" | "uncertain",
  "confidence": number,                  // 0..1, probability that a reviewer reaches the same verdict
  "snags": [
    {
      "code": string,                    // a code from the taxonomy below, exactly as written
      "severity": "minor" | "major" | "critical", // the code's default severity
      "confidence": number,              // 0..1, probability that a reviewer would raise exactly this remark
      "evidence": string,                // what you see and where, in English, specific enough to find it
      "bbox": { "x": number, "y": number, "w": number, "h": number }, // 0..1 of image size, x/y = top-left; whole frame for photo-level codes
      "reasonAr": string,                // short remark in Egyptian technical Arabic, reviewer style
      "reasonEn": string                 // same remark in English
    }
  ]
}`;

const RULES = [
  'Judge only what is visible in this photo. Do not assume defects outside the frame and do not invent details.',
  'Know what normal looks like: most photos you see show finished work that the reviewers accepted. Normal features of a finished site - open rack doors in an inside shot, cable ties and velcro straps, labels, fingers holding a label, pre-existing building dirt, open bend fittings of the duct system - are not snags. But the reviewers DO reject photos for small workmanship remarks (a missing dust cap, a cord outside the bundle, spares in the ODF, a duct cover not closed at the drop, dust on the rack floor, a torn label), so inspect every checklist item carefully and report every defect you can actually see.',
  'Use only codes from the taxonomy. Prefer the most specific code; *_UNTIDY codes and OTHER_SNAG are fallbacks used only when no specific code fits. Read "confusable with" before choosing.',
  'Report each code at most once per photo. If the same defect appears in several places, mention them in the evidence and put the bbox on the clearest instance.',
  'Evidence and confidence: every snag needs "evidence" (what and where), a bbox around it, and a calibrated "confidence" that a reviewer would raise it: 0.9+ unmistakable, 0.7-0.85 clearly visible, 0.45-0.65 probably there but partly hidden, small or a judgement call, 0.25-0.4 a faint suspicion worth a human look. Never suppress a possible defect - report it with a low confidence instead: the system sends low-confidence findings to a human reviewer and only rejects on confident major findings. Do not report anything below 0.25.',
  'Severity: use the default severity listed for the code. Only major and critical snags make a photo unacceptable; minor snags are reported as notes.',
  'Photo-quality codes (PERSON_IN_FRAME, PHOTO_BLURRY, PHOTO_TOO_DARK, WRONG_CATEGORY) must also be added to qualityIssues using the mapped flag.',
  'Category: if the main subject is neither the declared category nor one of its related categories, set categoryMatches=false, set detectedCategory, emit WRONG_CATEGORY, and still report clear snags you can see. If the subject is cut off or hidden so that the checklist cannot be judged, emit SUBJECT_NOT_FULLY_VISIBLE.',
  'Verdict: "reject" when at least one major or critical snag is clearly present; "accept" only when you inspected every checklist item that the photo shows and found no defect; "uncertain" when the photo cannot be judged (wrong or incomplete subject, too dark or blurred for the key criteria) or a possible defect needs a human look. The system re-derives the final verdict from your snags, severities and confidences, so be honest in each confidence.',
  'Green/red circles or drawings on the photo are reviewer annotations from old reports; ignore the marks themselves but still inspect what they point at.',
  'reasonAr: write like the reviewers do — short, practical Egyptian technical Arabic, naming the item and the fix (e.g. "نقفل الداكت من النزله", "نشيل الاسبير من جوه الاو دي اف"). reasonEn: a plain English equivalent.',
  'Return exactly one JSON object matching the output contract, with no prose before or after it.',
];

function renderTaxonomy(): string {
  return SNAG_TAXONOMY.map((s) => {
    const lines = [
      `### ${s.code} [${s.defaultSeverity}]`,
      `${s.titleEn} — ${s.titleAr}`,
      s.descriptionEn,
      `Look for: ${s.visualCues.join('; ')}.`,
    ];
    if (s.qualityIssue) lines.push(`qualityIssues flag: ${s.qualityIssue}`);
    if (s.confusableWith.length) lines.push(`Confusable with: ${s.confusableWith.join(', ')}`);
    if (s.reviewerPhrasesAr.length) lines.push(`Reviewer wording: ${s.reviewerPhrasesAr.slice(0, 3).join(' | ')}`);
    return lines.join('\n');
  }).join('\n\n');
}

function renderCategoryIndex(): string {
  return CHECKLISTS.map((c) => `- ${c.category}: ${c.titleEn} (${c.titleAr})`).join('\n');
}

let cachedPrefix: string | undefined;

/** The category-independent prompt prefix. */
export function buildSharedPrefix(): string {
  if (cachedPrefix !== undefined) return cachedPrefix;
  cachedPrefix = [
    '# Role',
    'You are a site-acceptance inspector for the Telecom Egypt BIG-EDGE project. Contractor RAYA installs Cisco ASR-9902, ASR-9906 and NCS-57C3 routers with their racks, ODFs, patch cords, armoured fibre, power and earth cabling in Egyptian telephone exchanges. Before handover, every installation photo is checked against a checklist and any defect ("snag") is sent back to the technician to fix and re-photograph.',
    'You receive ONE photo, the category it was uploaded under, and the checklist for that category. Find the snags visible in the photo and give a verdict.',
    '',
    '# Rules',
    RULES.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    '',
    '# Site decisions (apply them exactly)',
    renderSiteDecisions().map((r, i) => `D${i + 1}. ${r}`).join('\n'),
    '',
    '# Output contract',
    OUTPUT_CONTRACT,
    '',
    '# Photo categories',
    renderCategoryIndex(),
    '',
    `# Snag taxonomy (version ${TAXONOMY_VERSION})`,
    renderTaxonomy(),
  ].join('\n');
  return cachedPrefix;
}

/** Category-specific instructions; place after the shared prefix and before the image. */
export function buildCategoryBlock(category: PhotoCategory): string {
  const c = getChecklist(category);
  const codes = snagsForCategory(category).map((s) => s.code);
  return [
    `# Declared category: ${c.category} — ${c.titleEn} (${c.titleAr})`,
    c.purposeEn,
    '',
    '## The photo should show one of',
    c.requiredShots.map((s) => `- ${s.id}: ${s.descriptionEn}`).join('\n'),
    '',
    '## Acceptance criteria (each lists the codes to emit when it fails)',
    c.acceptanceCriteria.map((a) => `- ${a.id}: ${a.textEn} -> ${a.guardsCodes.join(', ')}`).join('\n'),
    '',
    '## Related categories (same subject, never WRONG_CATEGORY)',
    relatedCategories(category).join(', ') || '(none)',
    '',
    '## Codes applicable to this category',
    codes.join(', '),
    '',
    '## What an accepted photo looks like',
    c.goodExampleNotes.map((n) => `- ${n}`).join('\n'),
    '',
    'Inspect the photo now and return the JSON object.',
  ].join('\n');
}

/** FNV-1a 32-bit, hex. Enough to detect prompt changes; not a security hash. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function buildCategoryPrompt(category: PhotoCategory): CategoryPrompt {
  const prefix = buildSharedPrefix();
  const categoryBlock = buildCategoryBlock(category);
  return {
    category,
    prefix,
    categoryBlock,
    text: `${prefix}\n\n${categoryBlock}`,
    promptVersion: `${TAXONOMY_VERSION}+${fnv1a(prefix)}.${fnv1a(categoryBlock)}`,
  };
}
