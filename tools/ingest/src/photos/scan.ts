import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { PhotoCatalogRecord } from '../schemas.js';
import { toPosix } from '../paths.js';
import { categorize } from './category.js';

export interface PhotoSite {
  /** site label written to the catalogue */
  site: string;
  /** device label written to the catalogue */
  device: string;
  /** directory (relative to the raw root) whose sub-folders are the photo categories */
  photoRoot: string;
}

export interface ScanResult {
  records: PhotoCatalogRecord[];
  /** folders (relative to photoRoot) containing images that could not be categorised */
  unmapped: Array<{ site: string; folder: string; files: number }>;
  /** folders mapped by a documented guess rather than an unambiguous name */
  assumed: Array<{ site: string; folder: string; category: string; files: number }>;
}

const IMAGE_RE = /\.(jpe?g|png|webp|heic)$/i;

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (IMAGE_RE.test(e.name)) yield p;
  }
}

export async function scanPhotoSite(rawRoot: string, site: PhotoSite): Promise<ScanResult> {
  const base = path.join(rawRoot, site.photoRoot);
  const records: PhotoCatalogRecord[] = [];
  const unmappedCount = new Map<string, number>();
  const assumedCount = new Map<string, { category: string; files: number }>();

  for await (const file of walk(base)) {
    const folder = toPosix(path.relative(base, path.dirname(file)));
    const match = categorize(folder.split('/').filter(Boolean));
    if (!match) {
      unmappedCount.set(folder, (unmappedCount.get(folder) ?? 0) + 1);
      continue;
    }
    if (match.assumed) {
      const a = assumedCount.get(folder) ?? { category: match.category, files: 0 };
      a.files += 1;
      assumedCount.set(folder, a);
    }
    records.push(
      PhotoCatalogRecord.parse({
        site: site.site,
        device: site.device,
        category: match.category,
        relPath: toPosix(path.relative(rawRoot, file)),
        bytes: (await stat(file)).size,
        sha256: await sha256File(file),
      }),
    );
  }
  return {
    records,
    unmapped: [...unmappedCount].map(([folder, files]) => ({ site: site.site, folder, files })),
    assumed: [...assumedCount].map(([folder, v]) => ({ site: site.site, folder, ...v })),
  };
}

/** Group records by sha256 and return only those hashes with more than one file. */
export function findDuplicates(records: readonly PhotoCatalogRecord[]): Array<{ sha256: string; files: string[] }> {
  const by = new Map<string, string[]>();
  for (const r of records) by.set(r.sha256, [...(by.get(r.sha256) ?? []), r.relPath]);
  return [...by].filter(([, f]) => f.length > 1).map(([sha256, files]) => ({ sha256, files }));
}
