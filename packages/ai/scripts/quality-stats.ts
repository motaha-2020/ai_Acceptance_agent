/** Prints quality-gate metric distributions over the photo catalogue and snag photos (threshold calibration). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assessQuality } from '../src/quality.js';
import { resolvePaths } from '../eval/paths.js';

const { dataDir, rawRoot } = resolvePaths();
const lines = (f: string): Array<Record<string, unknown>> =>
  readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
const files: Array<{ set: string; file: string }> = [
  ...lines(path.join(dataDir, 'photo_catalog.jsonl')).map((r) => ({ set: 'catalog', file: path.join(rawRoot, String(r.relPath)) })),
  ...[...new Set(lines(path.join(dataDir, 'snags_seed.jsonl')).map((r) => r.imagePath).filter(Boolean))].map((p) => ({ set: 'snags', file: path.join(dataDir, String(p)) })),
];
const rows: Array<{ set: string; file: string; lap: number; mean: number; dark: number }> = [];
for (const f of files) {
  const q = await assessQuality(readFileSync(f.file));
  rows.push({ set: f.set, file: f.file, lap: q.metrics.laplacianVariance, mean: q.metrics.meanLuminance, dark: q.metrics.darkPixelShare });
}
const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)] ?? NaN;
for (const set of ['catalog', 'snags']) {
  const r = rows.filter((x) => x.set === set);
  for (const k of ['lap', 'mean', 'dark'] as const) {
    const xs = r.map((x) => x[k]);
    console.log(set, k, [0, 0.01, 0.05, 0.1, 0.5, 0.9, 0.99, 1].map((p) => `p${p * 100}=${pct(xs, p).toFixed(2)}`).join(' '));
  }
}
console.log('lowest sharpness:');
for (const r of [...rows].sort((a, b) => a.lap - b.lap).slice(0, 8)) console.log(r.lap.toFixed(1), r.mean.toFixed(0), r.file);
console.log('darkest:');
for (const r of [...rows].sort((a, b) => a.mean - b.mean).slice(0, 8)) console.log(r.mean.toFixed(1), r.dark.toFixed(2), r.file);
