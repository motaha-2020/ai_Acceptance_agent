import type { PhotoCategory } from '@acceptance/shared';
import { CHECKLISTS } from './checklists.js';

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ALIASES: ReadonlyArray<readonly [string, PhotoCategory]> = CHECKLISTS.flatMap((c) =>
  [...c.folderAliases, c.category, c.titleEn].map((a) => [norm(a), c.category] as const),
);

/**
 * Category from the deepest folder of an uploaded file whose name is a known site-folder alias
 * (e.g. "9906/ODF Tie/Labels ODF Tie/x.jpeg" -> odf_tie_labels). Used by the bulk-upload page as a first
 * guess and by the worker to auto-confirm photos whose folder and AI proposal agree (ADR 0005).
 */
export function guessCategoryFromPath(path: string): PhotoCategory | undefined {
  const folders = path.split(/[\\/]/).slice(0, -1).reverse();
  for (const f of folders) {
    const n = norm(f);
    const hit = ALIASES.find(([alias]) => alias === n);
    if (hit) return hit[1];
  }
  return undefined;
}
