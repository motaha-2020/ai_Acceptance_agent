/**
 * Few-shot reference examples in production (T3.5).
 *
 * The curated examples are described by a versioned manifest (FEW_SHOT_MANIFEST in fewshot-manifest.ts,
 * committed: ids, categories, labels, explanations - no image bytes). The images are customer photos
 * and are NOT in git: they live in object storage / a mounted directory as `<sha256>.jpg`, and are read
 * through the FewShotImageStore port. Every image is verified against its sha256 id, so a manifest
 * version pins the exact pictures (and the promptVersion changes with them).
 *
 * Wiring: createProvider() uses the bundled manifest automatically when AI_FEWSHOT_DIR (directory) or
 * AI_FEWSHOT_BASE_URL (HTTP prefix) is set; see packages/ai/README.md "Few-shot in production".
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PhotoCategory } from '@acceptance/shared';
import { z } from 'zod';
import type { FewShotExample, FewShotSource } from './prompt.js';

export const FewShotManifestEntry = z.object({
  /** sha256 (hex) of the original image bytes; also the integrity check. */
  id: z.string().regex(/^[0-9a-f]{64}$/),
  category: PhotoCategory,
  kind: z.enum(['good', 'snag']),
  codes: z.array(z.string()),
  /** Reviewer remark (Arabic) for snag examples. */
  note: z.string().optional(),
  /** Curator explanation shown to the model (why accepted / what the snag is and where). */
  explanation: z.string().optional(),
  /** Object key relative to the store root. Default `<id>.jpg`. */
  file: z.string().optional(),
  /** Provenance (dataset path), documentation only. */
  source: z.string().optional(),
});
export type FewShotManifestEntry = z.infer<typeof FewShotManifestEntry>;

export const FewShotManifest = z.object({
  version: z.string(),
  /** Longest side the reference images are downscaled to before sending. */
  maxSide: z.number().int().positive(),
  examples: z.array(FewShotManifestEntry),
});
export type FewShotManifest = z.infer<typeof FewShotManifest>;

/** Port: where the reference images come from (filesystem, HTTP/object storage, tests). */
export interface FewShotImageStore {
  get(key: string): Promise<Uint8Array>;
  describe(): string;
}

export function fsImageStore(dir: string): FewShotImageStore {
  return {
    get: async (key) => readFile(path.join(dir, key)),
    describe: () => `dir:${dir}`,
  };
}

/** Plain HTTP GET of `<baseUrl>/<key>` (e.g. a MinIO bucket prefix reachable on the internal network). */
export function httpImageStore(baseUrl: string, fetchImpl: typeof fetch = fetch): FewShotImageStore {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    get: async (key) => {
      const res = await fetchImpl(`${base}/${key.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) throw new Error(`few-shot image ${key}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    describe: () => `http:${base}`,
  };
}

export const fewShotKey = (e: FewShotManifestEntry): string => e.file ?? `${e.id}.jpg`;

export interface FewShotSourceOptions {
  /** Verify sha256(bytes) === id (default true). */
  verify?: boolean;
  /**
   * What to do when an image cannot be loaded or verified: 'throw' (default, the analysis fails and the
   * job is retried) or 'skip' (analyse without that category's examples; promptVersion shows it).
   */
  onError?: 'throw' | 'skip';
  log?: (msg: string) => void;
}

/** Lazy per-category loader: images are fetched on first use of a category and cached. */
export function createFewShotSource(manifest: FewShotManifest, store: FewShotImageStore, opts: FewShotSourceOptions = {}): FewShotSource {
  const parsed = FewShotManifest.parse(manifest);
  const cache = new Map<string, Promise<readonly FewShotExample[]>>();
  const load = async (category: PhotoCategory): Promise<readonly FewShotExample[]> => {
    const entries = parsed.examples.filter((e) => e.category === category);
    return Promise.all(
      entries.map(async (e): Promise<FewShotExample> => {
        const data = await store.get(fewShotKey(e));
        if (opts.verify !== false) {
          const sha = createHash('sha256').update(data).digest('hex');
          if (sha !== e.id) throw new Error(`few-shot image ${fewShotKey(e)} from ${store.describe()} has sha256 ${sha}, manifest says ${e.id}`);
        }
        return {
          id: e.id,
          category: e.category,
          kind: e.kind,
          image: { data, mediaType: 'image/jpeg' },
          codes: e.codes,
          ...(e.note ? { note: e.note } : {}),
          ...(e.explanation ? { explanation: e.explanation } : {}),
        };
      }),
    );
  };
  return (category) => {
    let p = cache.get(category);
    if (!p) {
      p = load(category).catch((err: unknown) => {
        cache.delete(category);
        if (opts.onError === 'skip') {
          opts.log?.(`few-shot ${parsed.version}/${category} unavailable, analysing without examples: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        }
        throw err;
      });
      cache.set(category, p);
    }
    return p;
  };
}

/**
 * Production default: the bundled manifest with images from AI_FEWSHOT_DIR or AI_FEWSHOT_BASE_URL.
 * Returns undefined (no few-shot) when neither is set.
 */
export function fewShotFromEnv(manifest: FewShotManifest, env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = (m) => console.warn(m)): FewShotSource | undefined {
  const dir = env.AI_FEWSHOT_DIR?.trim();
  const url = env.AI_FEWSHOT_BASE_URL?.trim();
  const store = dir ? fsImageStore(dir) : url ? httpImageStore(url) : undefined;
  if (!store) return undefined;
  return createFewShotSource(manifest, store, { onError: env.AI_FEWSHOT_STRICT === 'true' ? 'throw' : 'skip', log });
}
