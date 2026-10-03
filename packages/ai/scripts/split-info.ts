/** Prints the T3.5 TUNE/VAL/pool split sizes and the reserved few-shot pool (for curating the manifest). */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildSplitDataset, CatalogRecord, CategoryOverrides, GoodExclusions, readJsonl, SeedRecord } from '../eval/dataset.js';
import { resolvePaths } from '../eval/paths.js';

const paths = resolvePaths();
const evalDir = path.join(paths.dataDir, 'eval');
const read = <T>(f: string, s: { parse: (v: unknown) => T }): T | undefined => (existsSync(f) ? s.parse(JSON.parse(readFileSync(f, 'utf8'))) : undefined);
const split = (process.argv[2] ?? 'tune') as 'tune' | 'val';
const ds = buildSplitDataset(
  {
    seed: readJsonl(path.join(paths.dataDir, 'snags_seed.jsonl'), SeedRecord),
    catalog: readJsonl(path.join(paths.dataDir, 'photo_catalog.jsonl'), CatalogRecord),
    snagFile: (p) => path.join(paths.dataDir, p),
    catalogFile: (p) => path.join(paths.rawRoot, p),
  },
  { split, limit: Number(process.argv[3] ?? 60), seed: 1, overrides: read(path.join(evalDir, 'category_overrides.json'), CategoryOverrides), exclusions: read(path.join(evalDir, 'good_exclusions.json'), GoodExclusions) },
);
console.log(JSON.stringify({ splitSizes: ds.splitSizes, stats: ds.stats }, null, 1));
if (process.argv.includes('--pool')) for (const p of ds.pool) console.log([p.kind, p.category, p.sha256, p.expectedCodes.join(','), p.source, p.remarks.join(' // ')].join(' | '));
if (process.argv.includes('--items')) for (const p of ds.eval) console.log([p.kind, p.category, p.expectedCodes.join(','), p.source, p.overridden ?? ''].join(' | '));
