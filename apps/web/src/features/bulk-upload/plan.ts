import type { PhotoCategoryDto } from '@/lib/api/types';
import { CHECKLISTS } from '@/lib/taxonomy';

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ALIASES: ReadonlyArray<readonly [string, PhotoCategoryDto]> = CHECKLISTS.flatMap((c) =>
  [...c.folderAliases, c.category, c.titleEn].map((a) => [norm(a), c.category] as const),
);

/**
 * Category from the deepest folder of a dropped file whose name is a known site-folder alias
 * (e.g. "9906/ODF Tie/Labels ODF Tie/x.jpeg" -> odf_tie_labels). Only a first guess: the AI proposes
 * and the uploader confirms.
 */
export function guessCategoryFromPath(path: string): PhotoCategoryDto | undefined {
  const folders = path.split(/[\\/]/).slice(0, -1).reverse();
  for (const f of folders) {
    const n = norm(f);
    const hit = ALIASES.find(([alias]) => alias === n);
    if (hit) return hit[1];
  }
  return undefined;
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isImage(file: { name: string; type: string }): boolean {
  return IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run `task` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * RFC 4122 v4 UUID. `crypto.randomUUID()` only exists in secure contexts (HTTPS or localhost); the
 * portal is served over plain HTTP until a domain exists, where `crypto.getRandomValues` still works.
 */
export function uuidv4(rand: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const b = rand(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
