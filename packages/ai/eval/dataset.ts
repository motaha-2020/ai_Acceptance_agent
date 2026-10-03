/**
 * Eval-set construction (T3.4).
 *  - Snag photos: data/snags_seed.jsonl, grouped per image; expected codes = union of
 *    matchReviewerRemark() over the image's Arabic remarks. The upload category of these photos is
 *    unknown, so it is inferred from the codes (best effort) and category judgements are not scored.
 *  - Good photos: data/photo_catalog.jsonl ("assumed good": the delivered set), deduplicated by sha256,
 *    excluding any sha256 that is also a snag photo, sampled stratified by category.
 *  - Splits: few-shot pool vs eval, assigned by sha256 so an identical picture can never be in both.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PhotoCategory } from '@acceptance/shared';
import { fnv1a, getSnag, matchReviewerRemark } from '@acceptance/checklist';
import { z } from 'zod';

export const SeedRecord = z.object({
  id: z.string(),
  sourceDoc: z.string(),
  imagePath: z.string().nullable(),
  remarkAr: z.string().nullable(),
});
export type SeedRecord = z.infer<typeof SeedRecord>;

export const CatalogRecord = z.object({
  site: z.string(),
  category: PhotoCategory,
  relPath: z.string(),
  sha256: z.string(),
});
export type CatalogRecord = z.infer<typeof CatalogRecord>;

export interface EvalItem {
  id: string;
  kind: 'snag' | 'good';
  /** Absolute path to the image. */
  file: string;
  sha256: string;
  category: PhotoCategory;
  /** False for snag photos: the category was inferred, so category judgements are not scored. */
  categoryKnown: boolean;
  expectedVerdict: 'accept' | 'reject';
  expectedCodes: string[];
  /** Reviewer remarks (snag photos) for reports. */
  remarks: string[];
  source: string;
}

export interface DatasetOptions {
  /** Total eval photos (snag + good). */
  limit: number;
  /** Share of the eval set taken from snag photos (capped by availability). Default 0.5. */
  snagShare?: number;
  /** Good photos per category reserved for few-shot (never evaluated). Default 0. */
  fewShotGoodPerCategory?: number;
  /** Snag photos per inferred category reserved for few-shot. Default 0. */
  fewShotSnagPerCategory?: number;
  /** Sampling seed; same seed + same inputs = same dataset. */
  seed?: number;
}

export interface DatasetSources {
  seed: SeedRecord[];
  catalog: CatalogRecord[];
  /** Absolute path of a seed imagePath (relative to data/). */
  snagFile: (imagePath: string) => string;
  /** Absolute path of a catalogue relPath (relative to the raw root). */
  catalogFile: (relPath: string) => string;
  /** sha256 of a file; injectable for tests. */
  hashFile?: (file: string) => string;
}

export interface Dataset {
  eval: EvalItem[];
  fewShot: EvalItem[];
  stats: {
    snagPhotosAvailable: number;
    snagPhotosWithoutCodes: number;
    goodPhotosAvailable: number;
    goodExcludedAsSnag: number;
    evalSnag: number;
    evalGood: number;
    evalByCategory: Record<string, number>;
  };
}

export const sha256File = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Tie-break order for category inference: more specific subjects first. */
const CATEGORY_PRIORITY: readonly PhotoCategory[] = PhotoCategory.options;

/**
 * Best-effort category of a snag photo from its expected codes. The taxonomy lists a code's primary
 * category first (DUCT_TILTED -> duct, SPARE_LEFT_IN_ODF -> odf_cross_connect), so each code gives its
 * first category a full vote plus a small 0.25/|categories| vote to every category it applies to
 * (breaks ties towards categories shared by several codes). Returns undefined when no code is known.
 */
export function inferCategory(codes: readonly string[]): PhotoCategory | undefined {
  const score = new Map<PhotoCategory, number>();
  for (const code of codes) {
    const cats = getSnag(code)?.categories ?? [];
    cats.forEach((c, i) => score.set(c, (score.get(c) ?? 0) + (i === 0 ? 1 : 0) + 0.25 / cats.length));
  }
  let best: PhotoCategory | undefined;
  let bestScore = 0;
  for (const c of CATEGORY_PRIORITY) {
    const s = score.get(c) ?? 0;
    if (s > bestScore + 1e-9) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/** Deterministic pseudo-random order keyed by sha256 and seed. */
const orderKey = (sha: string, seed: number): string => fnv1a(`${seed}:${sha}`);
const seeded = <T extends { sha256: string }>(xs: readonly T[], seed: number): T[] =>
  [...xs].sort((a, b) => (orderKey(a.sha256, seed) < orderKey(b.sha256, seed) ? -1 : 1));

export function buildSnagItems(src: DatasetSources): EvalItem[] {
  const hash = src.hashFile ?? sha256File;
  const byImage = new Map<string, SeedRecord[]>();
  for (const r of src.seed) {
    if (!r.imagePath) continue;
    byImage.set(r.imagePath, [...(byImage.get(r.imagePath) ?? []), r]);
  }
  const bySha = new Map<string, EvalItem>();
  for (const [imagePath, recs] of byImage) {
    const file = src.snagFile(imagePath);
    const sha = hash(file);
    const remarks = recs.flatMap((r) => (r.remarkAr ? [r.remarkAr] : []));
    const codes = [...new Set(remarks.flatMap((r) => matchReviewerRemark(r)))];
    const prev = bySha.get(sha);
    if (prev) {
      // Same picture pasted in two snag documents: merge its labels.
      prev.expectedCodes = [...new Set([...prev.expectedCodes, ...codes])].sort();
      prev.remarks.push(...remarks);
      continue;
    }
    bySha.set(sha, {
      id: `snag:${recs[0]?.id ?? imagePath}`,
      kind: 'snag',
      file,
      sha256: sha,
      category: 'rack',
      categoryKnown: false,
      expectedVerdict: 'reject',
      expectedCodes: codes.sort(),
      remarks,
      source: imagePath,
    });
  }
  for (const item of bySha.values()) item.category = inferCategory(item.expectedCodes) ?? 'rack';
  return [...bySha.values()];
}

export function buildGoodItems(src: DatasetSources, excludeSha: ReadonlySet<string>): { items: EvalItem[]; excluded: number } {
  const seen = new Set<string>();
  const items: EvalItem[] = [];
  let excluded = 0;
  for (const r of src.catalog) {
    if (seen.has(r.sha256)) continue;
    seen.add(r.sha256);
    if (excludeSha.has(r.sha256)) {
      excluded++;
      continue;
    }
    items.push({
      id: `good:${r.sha256.slice(0, 12)}`,
      kind: 'good',
      file: src.catalogFile(r.relPath),
      sha256: r.sha256,
      category: r.category,
      categoryKnown: true,
      expectedVerdict: 'accept',
      expectedCodes: [],
      remarks: [],
      source: r.relPath,
    });
  }
  return { items, excluded };
}

/** Round-robin over categories (each in seeded order) until `n` items are taken. */
export function stratifiedSample(items: readonly EvalItem[], n: number, seed: number): EvalItem[] {
  const byCat = new Map<string, EvalItem[]>();
  for (const it of seeded(items, seed)) byCat.set(it.category, [...(byCat.get(it.category) ?? []), it]);
  const queues = [...byCat.keys()].sort().map((k) => byCat.get(k) ?? []);
  const out: EvalItem[] = [];
  while (out.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < n) out.push(next);
    }
  }
  return out;
}

/** Takes up to `perCategory` items per category for the few-shot pool. */
function takePerCategory(items: readonly EvalItem[], perCategory: number, seed: number): EvalItem[] {
  if (perCategory <= 0) return [];
  const count = new Map<string, number>();
  const out: EvalItem[] = [];
  for (const it of seeded(items, seed + 7)) {
    const c = count.get(it.category) ?? 0;
    if (c < perCategory) {
      out.push(it);
      count.set(it.category, c + 1);
    }
  }
  return out;
}

export function assertDisjoint(a: readonly EvalItem[], b: readonly EvalItem[]): void {
  const shas = new Set(a.map((x) => x.sha256));
  const clash = b.find((x) => shas.has(x.sha256));
  if (clash) throw new Error(`sha256 ${clash.sha256} appears in two splits (${clash.id})`);
}

export function buildDataset(src: DatasetSources, opts: DatasetOptions): Dataset {
  const seed = opts.seed ?? 1;
  const snag = buildSnagItems(src);
  const snagShas = new Set(snag.map((s) => s.sha256));
  const { items: good, excluded } = buildGoodItems(src, snagShas);

  const fewShot = [
    ...takePerCategory(good, opts.fewShotGoodPerCategory ?? 0, seed),
    ...takePerCategory(snag.filter((s) => s.expectedCodes.length > 0), opts.fewShotSnagPerCategory ?? 0, seed),
  ];
  const fewShas = new Set(fewShot.map((f) => f.sha256));
  const snagPool = seeded(snag.filter((s) => !fewShas.has(s.sha256)), seed);
  const goodPool = good.filter((g) => !fewShas.has(g.sha256));

  const nSnag = Math.min(snagPool.length, Math.round(opts.limit * (opts.snagShare ?? 0.5)));
  const nGood = Math.min(goodPool.length, opts.limit - nSnag);
  const evalItems = [...snagPool.slice(0, nSnag), ...stratifiedSample(goodPool, nGood, seed)];
  assertDisjoint(fewShot, evalItems);

  const evalByCategory: Record<string, number> = {};
  for (const it of evalItems) evalByCategory[it.category] = (evalByCategory[it.category] ?? 0) + 1;
  return {
    eval: evalItems,
    fewShot,
    stats: {
      snagPhotosAvailable: snag.length,
      snagPhotosWithoutCodes: snag.filter((s) => s.expectedCodes.length === 0).length,
      goodPhotosAvailable: good.length,
      goodExcludedAsSnag: excluded,
      evalSnag: nSnag,
      evalGood: nGood,
      evalByCategory,
    },
  };
}

export function readJsonl<T>(file: string, schema: z.ZodType<T>): T[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => schema.parse(JSON.parse(l)));
}
