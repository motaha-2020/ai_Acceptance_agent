import { describe, expect, it } from 'vitest';
import { assertDisjoint, buildDataset, inferCategory, stratifiedSample, type CatalogRecord, type DatasetSources, type EvalItem, type SeedRecord } from '../eval/dataset.js';

const seed: SeedRecord[] = [
  { id: 'd-01', sourceDoc: 'd', imagePath: 'snags/d/01.jpeg', remarkAr: 'نقفل الداكت من النزله' },
  { id: 'd-02-r1', sourceDoc: 'd', imagePath: 'snags/d/02.jpeg', remarkAr: 'نشيل الكرتونه من جواه الراك' },
  { id: 'd-02-r2', sourceDoc: 'd', imagePath: 'snags/d/02.jpeg', remarkAr: 'نقفل الداكت من النزله' },
  // same picture pasted in another document -> merged by sha256
  { id: 'e-07', sourceDoc: 'e', imagePath: 'snags/e/07.jpeg', remarkAr: 'نمسح الباغه' },
  { id: 'd-03', sourceDoc: 'd', imagePath: 'snags/d/03.jpeg', remarkAr: null },
];
const shaOf: Record<string, string> = {
  '/data/snags/d/01.jpeg': 'snag1',
  '/data/snags/d/02.jpeg': 'snag2',
  '/data/snags/e/07.jpeg': 'snag1',
  '/data/snags/d/03.jpeg': 'snag3',
};
const cats = ['rack', 'duct', 'pdu', 'router'] as const;
const catalog: CatalogRecord[] = [
  ...Array.from({ length: 40 }, (_, i) => ({ site: 's', category: cats[i % 4]!, relPath: `p/${i}.jpeg`, sha256: `good${i}` })),
  { site: 's', category: 'rack', relPath: 'p/dup.jpeg', sha256: 'good0' }, // duplicate
  { site: 's', category: 'duct', relPath: 'p/is-snag.jpeg', sha256: 'snag2' }, // also a snag photo
];
const sources: DatasetSources = {
  seed,
  catalog,
  snagFile: (p) => `/data/${p}`,
  catalogFile: (p) => `/raw/${p}`,
  hashFile: (f) => shaOf[f] ?? 'missing',
};

describe('eval dataset', () => {
  it('infers the category of snag photos from expected codes', () => {
    expect(inferCategory(['DUCT_COVER_OPEN'])).toBe('duct');
    expect(inferCategory(['SPARE_LEFT_IN_ODF'])).toBe('odf_cross_connect');
    expect(inferCategory(['RACK_BASE_BOLTS_MISSING', 'OTHER_SNAG'])).toBe('rack_base');
    expect(inferCategory([])).toBeUndefined();
  });

  it('builds snag + good sets, dedups by sha256 and keeps snag photos out of the good set', () => {
    const ds = buildDataset(sources, { limit: 20, seed: 3 });
    const snag = ds.eval.filter((i) => i.kind === 'snag');
    expect(snag.map((s) => s.sha256).sort()).toEqual(['snag1', 'snag2', 'snag3']);
    const merged = snag.find((s) => s.sha256 === 'snag1');
    expect(merged?.expectedCodes.length).toBeGreaterThanOrEqual(2); // duct remark + marker remark
    expect(merged?.categoryKnown).toBe(false);
    expect(snag.find((s) => s.sha256 === 'snag3')?.expectedCodes).toEqual([]);
    expect(ds.stats.goodExcludedAsSnag).toBe(1);
    const good = ds.eval.filter((i) => i.kind === 'good');
    expect(good).toHaveLength(17);
    expect(new Set(ds.eval.map((i) => i.sha256)).size).toBe(ds.eval.length);
    expect(good.every((g) => g.expectedVerdict === 'accept' && g.categoryKnown)).toBe(true);
  });

  it('stratifies good photos across categories', () => {
    const ds = buildDataset(sources, { limit: 11, snagShare: 0, seed: 1 });
    const counts = Object.values(ds.stats.evalByCategory).sort();
    expect(counts).toEqual([2, 3, 3, 3]);
  });

  it('reserves few-shot examples by sha256, never also in the eval split', () => {
    const ds = buildDataset(sources, { limit: 100, fewShotGoodPerCategory: 2, fewShotSnagPerCategory: 1, seed: 5 });
    expect(ds.fewShot.filter((f) => f.kind === 'good')).toHaveLength(8);
    const fs = new Set(ds.fewShot.map((f) => f.sha256));
    expect(ds.eval.some((e) => fs.has(e.sha256))).toBe(false);
    expect(ds.eval.length + ds.fewShot.length).toBe(40 + 3);
  });

  it('is deterministic per seed', () => {
    const a = buildDataset(sources, { limit: 10, seed: 9 }).eval.map((i) => i.id);
    const b = buildDataset(sources, { limit: 10, seed: 9 }).eval.map((i) => i.id);
    expect(a).toEqual(b);
  });

  it('assertDisjoint throws on overlap', () => {
    const item = (sha: string): EvalItem => ({ id: sha, kind: 'good', file: '', sha256: sha, category: 'rack', categoryKnown: true, expectedVerdict: 'accept', expectedCodes: [], remarks: [], source: '' });
    expect(() => assertDisjoint([item('x')], [item('x')])).toThrow(/two splits/);
    expect(stratifiedSample([item('a'), item('b')], 5, 1)).toHaveLength(2);
  });
});
