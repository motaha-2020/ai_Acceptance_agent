import path from 'node:path';
import { DATA_DIR, RAW_ROOT } from '../paths.js';
import { writeJson, writeJsonl } from '../io.js';
import type { PhotoCatalogRecord } from '../schemas.js';
import { findDuplicates, scanPhotoSite, type PhotoSite, type ScanResult } from '../photos/scan.js';

const SITES: PhotoSite[] = [
  { site: '9902', device: '9902', photoRoot: '9902/9902' },
  { site: '9906', device: '9906', photoRoot: '9906/9906' },
  { site: 'NCS-57C3', device: 'NCS-57C3', photoRoot: 'NCS-57C3/NCS-57C3' },
  { site: 'NASR3...C(R21C)', device: 'NASR3-R21C-C-EG', photoRoot: 'NASR3...C(R21C)/NASR3...C(R21C)/photos' },
];

const all: PhotoCatalogRecord[] = [];
const unmapped: ScanResult['unmapped'] = [];
const assumed: ScanResult['assumed'] = [];
for (const s of SITES) {
  const r = await scanPhotoSite(RAW_ROOT, s);
  all.push(...r.records);
  unmapped.push(...r.unmapped);
  assumed.push(...r.assumed);
}

await writeJsonl(path.join(DATA_DIR, 'photo_catalog.jsonl'), all);

// counts: category x site
const cats = [...new Set(all.map((r) => r.category))].sort();
console.log(`photos: ${all.length} -> ${path.join(DATA_DIR, 'photo_catalog.jsonl')}`);
console.log(['category'.padEnd(26), ...SITES.map((s) => s.site.padStart(16))].join(''));
for (const c of cats) {
  console.log(
    [c.padEnd(26), ...SITES.map((s) => String(all.filter((r) => r.site === s.site && r.category === c).length).padStart(16))].join(''),
  );
}
console.log(['TOTAL'.padEnd(26), ...SITES.map((s) => String(all.filter((r) => r.site === s.site).length).padStart(16))].join(''));

console.log(`\nunmapped folders: ${unmapped.length ? '' : 'none'}`);
for (const u of unmapped) console.log(`  ${u.site}: ${u.folder} (${u.files} files)`);
console.log(`assumed mappings: ${assumed.length ? '' : 'none'}`);
for (const a of assumed) console.log(`  ${a.site}: ${a.folder} -> ${a.category} (${a.files} files)`);

const dups = findDuplicates(all);
const byPath = new Map(all.map((r) => [r.relPath, r]));
const kind = (files: string[]): 'cross-site' | 'cross-category' | 'same-category' => {
  const rs = files.map((f) => byPath.get(f)!);
  if (new Set(rs.map((r) => r.site)).size > 1) return 'cross-site';
  if (new Set(rs.map((r) => r.category)).size > 1) return 'cross-category';
  return 'same-category';
};
const report = dups.map((d) => ({ ...d, kind: kind(d.files), categories: d.files.map((f) => byPath.get(f)!.category) }));
await writeJson(path.join(DATA_DIR, 'photo_duplicates.json'), report);

console.log(`\nduplicate groups by sha256: ${dups.length} (${dups.reduce((n, d) => n + d.files.length - 1, 0)} redundant files)`);
for (const k of ['same-category', 'cross-category', 'cross-site'] as const) {
  console.log(`  ${k}: ${report.filter((r) => r.kind === k).length} groups`);
}
console.log(`  details -> ${path.join(DATA_DIR, 'photo_duplicates.json')}`);
