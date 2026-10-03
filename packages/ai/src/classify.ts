/**
 * Category classification for bulk uploads (ADR 0005 phase A): which of the 20 photo categories does a
 * photo show? A small, cacheable prompt (category ids, titles, purposes, required shots) and a tiny output
 * schema, so it runs on the cheapest vision model. The uploader confirms or corrects every proposal before
 * the photo is analysed, so this is a suggestion, never a decision.
 */
import { PhotoCategory } from '@acceptance/shared';
import { CHECKLISTS, fnv1a } from '@acceptance/checklist';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { VendorClient } from './core.js';
import { ProviderError } from './errors.js';
import { prepareImage, type ImagePrepOptions } from './image.js';
import { extractJson, stripNulls } from './parse.js';
import { costUsd, DEFAULT_PRICES, totalInputTokens, type PriceTable } from './pricing.js';
import type { PromptParts } from './prompt.js';
import { DEFAULT_RETRY, withRetry, type RetryOptions } from './retry.js';
import type { JsonSchema } from './schema.js';

export const CLASSIFY_PROMPT_VERSION = 'cls2';

/** Pairs the model confuses most (measured on the catalogued site photos), with the visual tie-breaker. */
const DISAMBIGUATION = [
  'odf_cross_connect vs odf_tie vs test_room: the same green SC adapter panels. Name strip "... ODF CC" or patch cords going to the router = odf_cross_connect; armoured cable entering the ODF or strip "TIE"/"MMR" = odf_tie; an ODF in a different room/rack row than the router (far end) = test_room. If no name strip or cable is visible, lower the confidence and give the other one as alternative.',
  'Labels: a close-up whose main subject is printed cord labels. "R21C-Te0/1/0/x" + "ODFx G.." = odf_cross_connect_labels; "ODF(1)F(7,8) / ODF(2)A(7,8)" style = odf_tie_labels; two hostnames + ports (local and remote router) = uplink_labels; wrap-around labels on blue/black power cables = power_labels.',
  'Cords: thick yellow bundles on the basket tray between router and ODFs = patch_cords; a cord route described as going to another router/upstream (often a single labelled pair following the bundle) = uplink; closed white duct as the subject = duct; a single grey/blue UTP cable = management; black armoured fibre cable = armoured_cables.',
  'Power: under-floor ladder with blue/black cables = power_path; yellow-green earth conductor or earth bar as the subject = earth_path; PDU front with breakers = pdu; cables dressed at the rack top/sides into the PDU = power_system.',
  'rack = a whole rack (or racks) seen from the front; router = the router chassis front fills the frame; rack_base = metal frame in an opened raised floor; odf_sheet = a printed port table on the door.',
];

export const CategoryGuess = z.object({
  category: PhotoCategory,
  confidence: z.number().min(0).max(1),
  /** Second most likely category, when the photo could reasonably belong to two. */
  alternative: PhotoCategory.optional(),
});
export type CategoryGuess = z.infer<typeof CategoryGuess>;

export interface ClassifyMeta {
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number | undefined;
}

/** Deterministic system prompt (identical for every photo, so vendors cache it). */
export function classifySystemPrompt(): string {
  const lines = [
    'You sort photos of telecom equipment installations (router racks, ODFs, patch cords, power, earthing) into acceptance-checklist categories.',
    'Pick the ONE category whose subject is the main subject of the photo. Close-ups count as the category of the item they show (a label close-up of an ODF port is odf_cross_connect_labels or odf_tie_labels, a PDU close-up is pdu).',
    'confidence = probability that a field engineer would file the photo under that category: 0.9+ only when the subject is unmistakable, 0.5-0.75 when the photo fits two related categories (then give the other as alternative). Do not answer 0.95 by default.',
    'A file or folder name may be given with the photo. It is what the uploader called it: a strong hint, but trust what you see when it clearly contradicts the photo.',
    '',
    '# Categories (id: title. purpose. typical shots. what accepted photos look like)',
  ];
  for (const c of CHECKLISTS) {
    const shots = c.requiredShots.map((s) => s.descriptionEn).join(' / ');
    lines.push(`- ${c.category}: ${c.titleEn}. ${c.purposeEn} Shots: ${shots} Looks like: ${c.goodExampleNotes.slice(0, 2).join(' ')}`);
  }
  lines.push('', '# Telling similar categories apart', ...DISAMBIGUATION.map((d) => `- ${d}`));
  return lines.join('\n');
}

function classifySchema(): JsonSchema {
  const raw = zodToJsonSchema(CategoryGuess, { $refStrategy: 'none', target: 'jsonSchema7' }) as JsonSchema;
  delete raw.$schema;
  const props = raw.properties as Record<string, JsonSchema>;
  for (const p of Object.values(props)) {
    delete p.minimum;
    delete p.maximum;
  }
  return raw;
}

export interface ClassifierOptions {
  image?: ImagePrepOptions;
  retry?: RetryOptions;
  prices?: PriceTable;
  now?: () => number;
}

export class CategoryClassifier {
  private readonly system = classifySystemPrompt();
  private readonly schema = classifySchema();
  readonly promptVersion = `${CLASSIFY_PROMPT_VERSION}.${fnv1a(classifySystemPrompt())}`;

  constructor(
    private readonly vendor: VendorClient,
    private readonly opts: ClassifierOptions = {},
  ) {}

  /** `hint`: the uploaded file/folder name, if any (e.g. "9906/ODF Tie/ODF Tie (3).jpeg"). */
  async classify(image: Uint8Array, hint?: string): Promise<{ guess: CategoryGuess; meta: ClassifyMeta }> {
    const now = this.opts.now ?? Date.now;
    const t0 = now();
    // Category is recognisable at a lower resolution than defects: smaller image, fewer tokens.
    const photo = await prepareImage(image, this.opts.image ?? { maxSide: 1024, quality: 80 });
    const parts: PromptParts = {
      system: this.system,
      categoryBlock: 'Classify the attached photo.',
      fewShot: [],
      photo,
      photoText: `${hint ? `File name given by the uploader: ${hint.slice(-200)}\n` : ''}Return the JSON object now.`,
      promptVersion: this.promptVersion,
    };
    const call = (repair?: { previousOutput: string; error: string }) =>
      withRetry(() => this.vendor.complete({ parts, responseSchema: { name: 'category_guess', schema: this.schema }, ...(repair ? { repair } : {}) }), this.opts.retry ?? DEFAULT_RETRY);

    let reply = await call();
    let parsed = parseGuess(reply.text);
    let inputTokens = totalInputTokens(reply.usage);
    let outputTokens = reply.usage.outputTokens;
    let cost = costUsd(reply.model, reply.usage, this.opts.prices ?? DEFAULT_PRICES);
    if (!parsed.ok) {
      reply = await call({ previousOutput: reply.text, error: parsed.error });
      inputTokens += totalInputTokens(reply.usage);
      outputTokens += reply.usage.outputTokens;
      const second = costUsd(reply.model, reply.usage, this.opts.prices ?? DEFAULT_PRICES);
      cost = cost === undefined || second === undefined ? undefined : cost + second;
      parsed = parseGuess(reply.text);
      if (!parsed.ok) throw new ProviderError(this.vendor.vendor, 'invalid_output', `classification after repair: ${parsed.error}`);
    }
    return {
      guess: parsed.guess,
      meta: { provider: this.vendor.vendor, model: reply.model, promptVersion: this.promptVersion, inputTokens, outputTokens, latencyMs: now() - t0, costUsd: cost },
    };
  }
}

export function parseGuess(text: string): { ok: true; guess: CategoryGuess } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return { ok: false, error: `Output is not valid JSON (${(e as Error).message}).` };
  }
  const parsed = CategoryGuess.safeParse(stripNulls(json));
  if (!parsed.success) return { ok: false, error: `Output does not match the schema: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}.` };
  const g = parsed.data;
  return { ok: true, guess: g.alternative === g.category ? { category: g.category, confidence: g.confidence } : g };
}
