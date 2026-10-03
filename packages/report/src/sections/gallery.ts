import { CHECKLISTS } from '@acceptance/checklist';
import { AlignmentType, BorderStyle, ImageRun, Paragraph, Table, TableCell, TableLayoutType, TableRow, WidthType } from 'docx';
import type { GalleryPhoto, ReportData } from '../data.js';
import { note, PORTRAIT_WIDTH, run, sectionHeading, THEME, type Block } from '../docx/primitives.js';
import { headingOf } from './titles.js';

/** Max picture box per photo (px at 96 dpi): two photos per row on A4 portrait. */
export const PHOTO_BOX = { width: 330, height: 360 } as const;

export function fitBox(w: number, h: number, box: { width: number; height: number } = PHOTO_BOX): { width: number; height: number } {
  const scale = Math.min(box.width / w, box.height / h, 1);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const COL = Math.floor(PORTRAIT_WIDTH / 2);

function photoCell(p: GalleryPhoto | undefined, titleEn: string, titleAr: string): TableCell {
  if (!p) return new TableCell({ width: { size: COL, type: WidthType.DXA }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE }, children: [new Paragraph('')] });
  const size = fitBox(p.width, p.height);
  const meta = [p.device, p.capturedAt ? p.capturedAt.slice(0, 16).replace('T', ' ') : null].filter(Boolean).join(' · ');
  return new TableCell({
    width: { size: COL, type: WidthType.DXA },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new ImageRun({ type: p.mime, data: p.image, transformation: size, altText: { name: p.id, title: titleEn, description: `${titleEn} photo ${meta}` } })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(`${titleEn} / `, { size: 16, bold: true }), run(titleAr, { size: 16, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(meta, { size: 14, color: THEME.muted })] }),
    ],
  });
}

/** Approved photos only, grouped by category (checklist order), two per row with captions. */
export function buildGallery(data: ReportData): Block[] {
  const blocks: Block[] = [sectionHeading(`${headingOf('gallery')}.`, { pageBreakBefore: true })];
  if (!data.gallery.length) return [...blocks, note('No approved photos yet.')];
  for (const c of CHECKLISTS) {
    const photos = data.gallery.filter((p) => p.category === c.category);
    if (!photos.length) continue;
    blocks.push(new Paragraph({ keepNext: true, spacing: { before: 200, after: 120 }, children: [run(`${c.titleEn} — `, { bold: true, size: 24, color: THEME.accent }), run(c.titleAr, { bold: true, size: 24, color: THEME.accent })] }));
    const rows: TableRow[] = [];
    for (let i = 0; i < photos.length; i += 2) {
      rows.push(new TableRow({ cantSplit: true, children: [photoCell(photos[i], c.titleEn, c.titleAr), photoCell(photos[i + 1], c.titleEn, c.titleAr)] }));
    }
    blocks.push(new Table({ width: { size: COL * 2, type: WidthType.DXA }, columnWidths: [COL, COL], layout: TableLayoutType.FIXED, rows }));
  }
  return blocks;
}
