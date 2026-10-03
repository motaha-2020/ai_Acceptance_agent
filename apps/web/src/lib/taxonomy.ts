import { CHECKLISTS, SNAG_TAXONOMY, getChecklist, getSnag, normalizeArabic, type CategoryChecklist, type SnagDefinition } from '@acceptance/checklist';
import { PhotoCategory } from '@acceptance/shared';
import type { AppLocale } from '@/i18n/config';
import type { PhotoCategoryDto } from '@/lib/api/types';

/** Single place where the web app reads the snag taxonomy and category checklists. */
export const CATEGORIES: readonly PhotoCategoryDto[] = PhotoCategory.options;
export { SNAG_TAXONOMY, CHECKLISTS };
export type { CategoryChecklist, SnagDefinition };

export function categoryChecklist(category: PhotoCategoryDto): CategoryChecklist {
  return getChecklist(category);
}

export function categoryTitle(category: string, locale: AppLocale): string {
  const c = CHECKLISTS.find((x) => x.category === category);
  if (!c) return category;
  return locale === 'ar' ? c.titleAr : c.titleEn;
}

export function snagDefinition(code: string): SnagDefinition | undefined {
  return getSnag(code);
}

/** Title in the UI language first, the other language as secondary (technical English terms are common). */
export function snagTitles(code: string, locale: AppLocale, fallback?: { textAr?: string; textEn?: string }): { primary: string; secondary: string } {
  const def = getSnag(code);
  const ar = def?.titleAr ?? fallback?.textAr ?? code;
  const en = def?.titleEn ?? fallback?.textEn ?? code;
  return locale === 'ar' ? { primary: ar, secondary: en } : { primary: en, secondary: ar };
}

export function snagTitle(code: string, locale: AppLocale, fallback?: { textAr?: string; textEn?: string }): string {
  return snagTitles(code, locale, fallback).primary;
}

const norm = (s: string): string => normalizeArabic(s).toLowerCase();
/**
 * Egyptian Arabic spells the same word many ways (ليبل / ليبول / الليبل). The "skeleton" drops the
 * long-vowel letters so those variants still match each other.
 */
const skeleton = (s: string): string => s.replace(/[اوىيءؤئ]/g, '');
const ARABIC = /[؀-ۿ]/;

interface SearchEntry {
  def: SnagDefinition;
  haystack: string;
  skeleton: string;
}

let searchIndex: SearchEntry[] | null = null;
function index(): SearchEntry[] {
  searchIndex ??= SNAG_TAXONOMY.map((def) => {
    const haystack = norm([def.code, def.titleAr, def.titleEn, def.descriptionEn, ...def.reviewerPhrasesAr].join(' '));
    return { def, haystack, skeleton: skeleton(haystack) };
  });
  return searchIndex;
}

function termMatches(entry: SearchEntry, term: string): boolean {
  if (entry.haystack.includes(term)) return true;
  if (!ARABIC.test(term)) return false;
  const sk = skeleton(term);
  return sk.length >= 2 && entry.skeleton.includes(sk);
}

/**
 * Searchable snag picker backing function: Arabic (diacritic/alef-normalised) or English, matched
 * on code, titles and the reviewers' own phrases. Snags that apply to `category` rank first.
 */
export function searchSnags(query: string, category?: PhotoCategoryDto, limit = 40): SnagDefinition[] {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const scored: Array<{ def: SnagDefinition; score: number }> = [];
  for (const entry of index()) {
    const { def } = entry;
    if (!terms.every((t) => termMatches(entry, t))) continue;
    let score = 0;
    if (category && def.categories.includes(category)) score += 10;
    const title = norm(`${def.titleAr} ${def.titleEn} ${def.code}`);
    for (const t of terms) if (title.includes(t)) score += 3;
    if (!terms.length && def.group === 'photo_quality') score -= 1;
    scored.push({ def, score });
  }
  scored.sort((a, b) => b.score - a.score || a.def.code.localeCompare(b.def.code));
  return scored.slice(0, limit).map((s) => s.def);
}
