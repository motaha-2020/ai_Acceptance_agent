import { CHECKLISTS } from '@acceptance/checklist';
import type { PhotoCategory, PhotoStatus } from '@acceptance/shared';
import type { ReportData } from '../data.js';
import { SID_CHECKLIST, type DerivedRule, type SidItem } from './items.js';

export type ItemStatus = 'pass' | 'fail' | 'pending' | 'manual' | 'na';

export interface ItemResult {
  id: string;
  section: string;
  text: string;
  status: ItemStatus;
  /** Shown in the Status column: OK / NOT OK / PENDING / the manual value / N/A – manual. */
  label: string;
  /** Evidence, e.g. "4 approved photos; 1 snag fixed and verified". */
  comment: string;
}

export interface CategorySummary {
  category: PhotoCategory;
  titleEn: string;
  titleAr: string;
  approved: number;
  rejected: number;
  pending: number;
  openSnags: number;
  fixedSnags: number;
  verifiedSnags: number;
  status: ItemStatus;
}

/** Fiber loss above this is reported as a failed reading (same threshold as the import cross-check). */
export const LOSS_LIMIT_DB = 3;
const PENDING_PHOTO: ReadonlySet<PhotoStatus> = new Set(['uploaded', 'ai_analyzed', 'pending_review', 'fixed']);

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function photoItem(item: Extract<SidItem, { kind: 'photo' }>, data: ReportData): Omit<ItemResult, 'id' | 'section' | 'text'> {
  const inCats = (c: PhotoCategory): boolean => item.categories.length === 0 || item.categories.includes(c);
  const snags = data.snags.filter((s) => inCats(s.category) && (item.codes.length === 0 || item.codes.includes(s.code)));
  const open = snags.filter((s) => s.status === 'open');
  const fixed = snags.filter((s) => s.status === 'fixed');
  const verified = snags.filter((s) => s.status === 'verified');
  const count = (pred: (s: PhotoStatus) => boolean): number =>
    data.photoStats.filter((p) => inCats(p.category) && pred(p.status)).reduce((a, p) => a + p.count, 0);
  const approved = count((s) => s === 'approved');
  const pending = count((s) => PENDING_PHOTO.has(s));

  if (open.length) {
    const codes = [...new Set(open.map((s) => s.code))].join(', ');
    return { status: 'fail', label: 'NOT OK', comment: `${plural(open.length, 'open snag')}: ${codes}` };
  }
  if (fixed.length) return { status: 'pending', label: 'PENDING', comment: `${plural(fixed.length, 'snag')} fixed, awaiting verification` };
  if (approved === 0 && pending > 0) return { status: 'pending', label: 'PENDING', comment: `${plural(pending, 'photo')} awaiting review` };
  if (approved > 0) {
    const extra = verified.length ? `; ${plural(verified.length, 'snag')} fixed and verified` : '';
    return { status: 'pass', label: 'OK', comment: `${plural(approved, 'approved photo')}${extra}` };
  }
  const answer = data.survey[item.id];
  if (answer) return { status: 'manual', label: answer.value, comment: answer.comment ?? 'manual answer (no photos)' };
  return { status: 'na', label: 'N/A – manual', comment: 'no photos of this area yet' };
}

function derivedItem(rule: DerivedRule, data: ReportData): Omit<ItemResult, 'id' | 'section' | 'text'> {
  const na = (comment: string) => ({ status: 'na' as const, label: 'N/A – manual', comment });
  const inv = data.inventory?.entries ?? [];
  switch (rule) {
    case 'fiber_loss': {
      const all = data.fiberTests.flatMap((t) => t.measurements);
      if (!all.length) return na('no fiber test results imported');
      const max = Math.max(...all.map((m) => m.lossDb));
      const bad = all.filter((m) => m.lossDb > LOSS_LIMIT_DB || m.lossDb < 0);
      if (bad.length) return { status: 'fail', label: 'NOT OK', comment: `${plural(bad.length, 'reading')} outside 0–${LOSS_LIMIT_DB} dB of ${all.length} (max ${max} dB)` };
      return { status: 'pass', label: 'OK', comment: `${all.length} readings, max ${max} dB` };
    }
    case 'odf_spare': {
      const entries = data.utilization.flatMap((u) => u.entries);
      if (!entries.length) return na('no ODF utilization sheets imported');
      const free = entries.filter((e) => !e.port).length;
      const pct = Math.round((free / entries.length) * 1000) / 10;
      return { status: pct >= 10 ? 'pass' : 'fail', label: pct >= 10 ? 'OK' : 'NOT OK', comment: `${free} of ${entries.length} ODF positions free (${pct}%)` };
    }
    case 'power_redundancy': {
      if (!inv.length) return na('no device inventory imported');
      const n = inv.filter((e) => e.kind === 'power_module').length;
      return { status: n >= 2 ? 'pass' : 'fail', label: n >= 2 ? 'OK' : 'NOT OK', comment: `${plural(n, 'power module')} in inventory` };
    }
    case 'control_redundancy': {
      if (!inv.length) return na('no device inventory imported');
      const n = inv.filter((e) => e.kind === 'route_processor').length;
      return { status: n >= 2 ? 'pass' : 'fail', label: n >= 2 ? 'OK' : 'NOT OK', comment: `${plural(n, 'route processor')} in inventory` };
    }
    case 'hw_list_match': {
      if (!inv.length) return na('no device inventory imported');
      if (data.bom.activeSource !== 'sid') return na('no delivered HW list (BOM generated from inventory)');
      const invSn = new Set(inv.map((e) => e.sn).filter(Boolean));
      const bomSn = new Set(data.bom.active.flatMap((b) => b.serials));
      const missing = [...bomSn].filter((s) => !invSn.has(s)).length;
      const extra = [...invSn].filter((s) => !bomSn.has(s)).length;
      if (!missing && !extra) return { status: 'pass', label: 'OK', comment: `${bomSn.size} serials match the inventory` };
      return { status: 'fail', label: 'NOT OK', comment: `${missing} BOM serials not installed, ${extra} installed serials not in BOM` };
    }
  }
}

/** Status of every SID checklist item, derived from photos, snags and site technical data. */
export function deriveChecklist(data: ReportData): ItemResult[] {
  return SID_CHECKLIST.map((item) => {
    const base = { id: item.id, section: item.section, text: item.text };
    if (item.kind === 'photo') return { ...base, ...photoItem(item, data) };
    if (item.kind === 'derived') return { ...base, ...derivedItem(item.rule, data) };
    const answer = data.survey[item.id];
    return answer
      ? { ...base, status: 'manual' as const, label: answer.value, comment: answer.comment ?? 'site survey' }
      : { ...base, status: 'na' as const, label: 'N/A – manual', comment: 'site survey / measurement' };
  });
}

/** Per photo category: counts and an overall status (categories without photos or snags are omitted). */
export function summarizeCategories(data: ReportData): CategorySummary[] {
  return CHECKLISTS.map((c) => {
    const stat = (pred: (s: PhotoStatus) => boolean): number =>
      data.photoStats.filter((p) => p.category === c.category && pred(p.status)).reduce((a, p) => a + p.count, 0);
    const snags = data.snags.filter((s) => s.category === c.category);
    const row = {
      category: c.category,
      titleEn: c.titleEn,
      titleAr: c.titleAr,
      approved: stat((s) => s === 'approved'),
      rejected: stat((s) => s === 'rejected'),
      pending: stat((s) => PENDING_PHOTO.has(s)),
      openSnags: snags.filter((s) => s.status === 'open').length,
      fixedSnags: snags.filter((s) => s.status === 'fixed').length,
      verifiedSnags: snags.filter((s) => s.status === 'verified').length,
    };
    const status: ItemStatus = row.openSnags ? 'fail' : row.fixedSnags || row.pending ? 'pending' : row.approved ? 'pass' : 'na';
    return { ...row, status };
  }).filter((r) => r.approved + r.rejected + r.pending + r.openSnags + r.fixedSnags + r.verifiedSnags > 0);
}

export function checklistTotals(items: readonly ItemResult[]): Record<ItemStatus, number> {
  const t: Record<ItemStatus, number> = { pass: 0, fail: 0, pending: 0, manual: 0, na: 0 };
  for (const i of items) t[i.status] += 1;
  return t;
}
