import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AnalysisResult, PhotoCategory } from '@acceptance/shared';
import {
  CHECKLISTS,
  CategoryChecklist,
  FALLBACK_CODES,
  SNAG_CODES,
  SNAG_TAXONOMY,
  SnagDefinition,
  buildCategoryPrompt,
  buildSharedPrefix,
  getSnag,
  matchReviewerRemark,
  renderTaxonomyMarkdown,
  snagsForCategory,
} from '../src/index.js';

const ARABIC = /[؀-ۿ]/;

describe('taxonomy data', () => {
  it('every snag definition passes the zod schema', () => {
    for (const s of SNAG_TAXONOMY) {
      const r = SnagDefinition.safeParse(s);
      expect(r.success, `${s.code}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
  });

  it('codes are unique', () => {
    expect(new Set(SNAG_CODES).size).toBe(SNAG_CODES.length);
  });

  it('codes are UPPER_SNAKE', () => {
    for (const c of SNAG_CODES) expect(c).toMatch(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/);
  });

  it('Arabic fields are non-empty and contain Arabic', () => {
    for (const s of SNAG_TAXONOMY) {
      for (const f of [s.titleAr, s.descriptionAr, s.fixInstructionAr, ...s.reviewerPhrasesAr]) {
        expect(f.trim().length, s.code).toBeGreaterThan(0);
        expect(f, s.code).toMatch(ARABIC);
      }
    }
  });

  it('confusableWith references existing codes and never itself', () => {
    for (const s of SNAG_TAXONOMY) {
      for (const c of s.confusableWith) {
        expect(getSnag(c), `${s.code} -> ${c}`).toBeDefined();
        expect(c).not.toBe(s.code);
      }
    }
  });

  it('category lists have no duplicates', () => {
    for (const s of SNAG_TAXONOMY) expect(new Set(s.categories).size, s.code).toBe(s.categories.length);
  });

  it('a reviewer phrase maps to exactly one code (mutual exclusivity of wording)', () => {
    const seen = new Map<string, string>();
    for (const s of SNAG_TAXONOMY) {
      for (const p of s.reviewerPhrasesAr) {
        const key = p.trim();
        expect(seen.get(key), `"${key}" used by ${seen.get(key)} and ${s.code}`).toBeUndefined();
        seen.set(key, s.code);
      }
    }
  });

  it('quality-issue flags are valid AnalysisResult values', () => {
    const allowed = AnalysisResult.shape.qualityIssues.element.options;
    for (const s of SNAG_TAXONOMY) if (s.qualityIssue) expect(allowed).toContain(s.qualityIssue);
    // each AnalysisResult quality flag is produced by some code
    for (const q of allowed) expect(SNAG_TAXONOMY.some((s) => s.qualityIssue === q), q).toBe(true);
  });

  it('every category has at least one specific (non photo-quality) code', () => {
    for (const cat of PhotoCategory.options) {
      const specific = snagsForCategory(cat).filter((s) => s.group !== 'photo_quality' && !FALLBACK_CODES.has(s.code));
      expect(specific.length, cat).toBeGreaterThan(0);
    }
  });
});

describe('checklists', () => {
  it('every checklist passes the zod schema', () => {
    for (const c of CHECKLISTS) {
      const r = CategoryChecklist.safeParse(c);
      expect(r.success, `${c.category}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
  });

  it('every PhotoCategory has exactly one checklist', () => {
    const cats = CHECKLISTS.map((c) => c.category);
    expect([...cats].sort()).toEqual([...PhotoCategory.options].sort());
  });

  it('criterion ids are unique', () => {
    const ids = CHECKLISTS.flatMap((c) => c.acceptanceCriteria.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every criterion references existing codes applicable to its category', () => {
    for (const c of CHECKLISTS) {
      const applicable = new Set(snagsForCategory(c.category).map((s) => s.code));
      for (const a of c.acceptanceCriteria) {
        for (const code of a.guardsCodes) {
          expect(getSnag(code), `${a.id} -> ${code}`).toBeDefined();
          expect(applicable.has(code), `${a.id} -> ${code} not applicable to ${c.category}`).toBe(true);
        }
      }
    }
  });

  it('Arabic checklist fields are non-empty', () => {
    for (const c of CHECKLISTS) {
      expect(c.titleAr).toMatch(ARABIC);
      for (const s of c.requiredShots) expect(s.descriptionAr, `${c.category}/${s.id}`).toMatch(ARABIC);
      for (const a of c.acceptanceCriteria) expect(a.textAr, a.id).toMatch(ARABIC);
    }
  });

  it('every non-fallback, non-quality code is guarded by at least one criterion', () => {
    const guarded = new Set(CHECKLISTS.flatMap((c) => c.acceptanceCriteria.flatMap((a) => a.guardsCodes)));
    const unguarded = SNAG_TAXONOMY.filter((s) => !FALLBACK_CODES.has(s.code) && !guarded.has(s.code)).map((s) => s.code);
    expect(unguarded).toEqual([]);
  });
});

describe('prompt', () => {
  it('prefix is identical for every category (cacheable)', () => {
    const prefixes = new Set(PhotoCategory.options.map((c) => buildCategoryPrompt(c).prefix));
    expect(prefixes.size).toBe(1);
    expect(buildSharedPrefix()).toBe([...prefixes][0]);
  });

  it('is deterministic', () => {
    for (const c of PhotoCategory.options) {
      expect(buildCategoryPrompt(c)).toEqual(buildCategoryPrompt(c));
    }
  });

  it('contains every code in the prefix and only applicable codes in the category block', () => {
    const prefix = buildSharedPrefix();
    for (const code of SNAG_CODES) expect(prefix).toContain(`### ${code} [`);
    const p = buildCategoryPrompt('rack_base');
    const listed = p.categoryBlock.split('## Codes applicable to this category\n')[1]!.split('\n')[0]!.split(', ');
    expect(listed).toEqual(snagsForCategory('rack_base').map((s) => s.code));
    expect(listed).not.toContain('DUST_CAP_MISSING');
  });

  it('promptVersion differs between categories and is stable', () => {
    const versions = PhotoCategory.options.map((c) => buildCategoryPrompt(c).promptVersion);
    expect(new Set(versions).size).toBe(versions.length);
    expect(buildCategoryPrompt('rack').promptVersion).toBe(buildCategoryPrompt('rack').promptVersion);
  });

  it('text is prefix followed by the category block', () => {
    const p = buildCategoryPrompt('pdu');
    expect(p.text.startsWith(p.prefix)).toBe(true);
    expect(p.text.endsWith(p.categoryBlock)).toBe(true);
  });
});

describe('reviewer remark matching', () => {
  const cases: [string, string[]][] = [
    ['1-نقفل الداكت من النزله', ['DUCT_COVER_OPEN']],
    ['2-الكابلر مش راكب الغطاء بتاعه', ['DUST_CAP_MISSING']],
    ['1-الاسيبر جوا الاو دي اف', ['SPARE_LEFT_IN_ODF']],
    ['1_نحط 8 مسامير في كل رجل من القاعده', ['RACK_BASE_BOLTS_MISSING']],
    ['3-مسح الباغه', ['MARKER_OR_STAIN_MARKS']],
    ['1-عدم ظهور شخص في الصوره', ['PERSON_IN_FRAME']],
    ['الباكست تري مش نفس المستوي', ['CABLE_TRAY_MISALIGNED']],
    ['1-نقفل الشنيشه', ['WALL_OPENING_NOT_SEALED']],
    ['1-نحط اسكوتش نظبط السستمه باسكوتش', ['PATCH_CORD_NOT_BUNDLED']],
    ['3- السستمه تتعدل', ['PATCH_CORD_ROUTING_UNTIDY']],
    ['وضع اسكوتش للتظبيط السستمه', ['PATCH_CORD_NOT_BUNDLED']],
    ['1', []],
    ['ه', []],
  ];
  it.each(cases)('%s', (remark, expected) => {
    expect(matchReviewerRemark(remark)).toEqual(expected);
  });
});

describe('docs', () => {
  it('docs/snag-taxonomy.md is in sync with the code (run gen:docs)', () => {
    const path = fileURLToPath(new URL('../../../docs/snag-taxonomy.md', import.meta.url));
    const onDisk = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(renderTaxonomyMarkdown());
  });
});
