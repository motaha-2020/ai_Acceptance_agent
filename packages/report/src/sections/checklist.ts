import type { ReportData } from '../data.js';
import { checklistTotals, deriveChecklist, summarizeCategories, type ItemResult } from '../checklist/derive.js';
import { dataTable, para, sectionHeading, statusColor, subHeading, THEME, type Block, type CellInput } from '../docx/primitives.js';
import { headingOf } from './titles.js';

const STATUS_TEXT = { pass: 'OK', fail: 'NOT OK', pending: 'PENDING', manual: 'MANUAL', na: 'N/A' } as const;

function itemRows(items: ItemResult[]): CellInput[][] {
  const rows: CellInput[][] = [];
  let section = '';
  for (const i of items) {
    if (i.section !== section) {
      section = i.section;
      rows.push([{ text: section, bold: true, fill: THEME.sectionFill, span: 4 }]);
    }
    rows.push([i.id, i.text, { text: i.label, bold: true, color: statusColor(i.status) }, i.comment]);
  }
  return rows;
}

/** SID acceptance checklist (58 items) with derived statuses, then a per-photo-category summary. */
export function buildChecklist(data: ReportData): Block[] {
  const items = deriveChecklist(data);
  const t = checklistTotals(items);
  const blocks: Block[] = [
    sectionHeading(`${headingOf('checklist')}.`, { pageBreakBefore: true }),
    para(`${items.length} items: ${t.pass} OK, ${t.fail} not OK, ${t.pending} pending, ${t.manual} answered manually, ${t.na} N/A (manual check).`, { size: 20 }),
    dataTable(
      [{ header: '#', weight: 0.5, align: 'center' }, { header: 'Area', weight: 6 }, { header: 'Status', weight: 1.4, align: 'center' }, { header: 'Comments', weight: 3 }],
      itemRows(items),
      { size: 16 },
    ),
    subHeading('Summary per photo category'),
  ];
  const cats = summarizeCategories(data);
  blocks.push(
    cats.length
      ? dataTable(
          [
            { header: 'Category', weight: 3.2 },
            { header: 'Approved', weight: 1, align: 'center' },
            { header: 'Rejected', weight: 1, align: 'center' },
            { header: 'Pending', weight: 1, align: 'center' },
            { header: 'Open snags', weight: 1, align: 'center' },
            { header: 'Fixed', weight: 1, align: 'center' },
            { header: 'Verified', weight: 1, align: 'center' },
            { header: 'Status', weight: 1.2, align: 'center' },
          ],
          cats.map((c) => [
            `${c.titleEn}\n${c.titleAr}`,
            c.approved,
            c.rejected,
            c.pending,
            c.openSnags ? { text: String(c.openSnags), bold: true, color: THEME.fail } : '0',
            c.fixedSnags,
            c.verifiedSnags,
            { text: STATUS_TEXT[c.status], bold: true, color: statusColor(c.status) },
          ]),
          { size: 16 },
        )
      : para('No photos have been captured for this site yet.', { italics: true, size: 18 }),
  );
  return blocks;
}
