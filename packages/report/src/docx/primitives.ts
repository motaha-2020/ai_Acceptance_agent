import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
  type ParagraphChild,
} from 'docx';

/** SID look: Calibri body, blue accents, light-blue label cells, dark-blue table headers. */
export const THEME = {
  font: 'Calibri',
  /** Complex-script (Arabic) font: present on Windows; LibreOffice maps it to Liberation Sans / Noto. */
  arabicFont: 'Arial',
  headingFont: 'Cambria',
  titleColor: '1F497D',
  accent: '2E74B5',
  labelFill: 'D9E2F3',
  headerFill: '2E74B5',
  sectionFill: 'DEEAF6',
  pass: '2E7D32',
  fail: 'C62828',
  pending: 'B26A00',
  muted: '595959',
} as const;

export const NUMBERING_REF = 'sid-sections';

/** A4 printable width in twips with 0.5" margins (SID page setup). */
export const PORTRAIT_WIDTH = 11906 - 2 * 720;
export const LANDSCAPE_WIDTH = 16838 - 2 * 720;

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
export const hasArabic = (s: string): boolean => ARABIC.test(s);

export interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  color?: string;
  /** Half-points (22 = 11 pt). */
  size?: number;
  underline?: boolean;
}

/** A run that renders Arabic right-to-left with an Arabic-capable complex-script font. */
export function run(text: string, style: RunStyle = {}): TextRun {
  const rtl = hasArabic(text);
  return new TextRun({
    text,
    bold: style.bold,
    boldComplexScript: style.bold,
    italics: style.italics,
    color: style.color,
    size: style.size,
    sizeComplexScript: style.size,
    underline: style.underline ? {} : undefined,
    rightToLeft: rtl || undefined,
    font: { ascii: THEME.font, hAnsi: THEME.font, cs: THEME.arabicFont, eastAsia: THEME.font },
  });
}

export interface ParaOptions extends RunStyle {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  spacingAfter?: number;
  keepNext?: boolean;
}

/** Paragraph; text with Arabic becomes a bidirectional (RTL) paragraph. */
export function para(text: string | ParagraphChild[], opts: ParaOptions = {}): Paragraph {
  const children = typeof text === 'string' ? [run(text, opts)] : text;
  const rtl = typeof text === 'string' && hasArabic(text) && !/[A-Za-z]/.test(text);
  return new Paragraph({
    children,
    alignment: opts.align,
    bidirectional: rtl || undefined,
    keepNext: opts.keepNext,
    spacing: { after: opts.spacingAfter ?? 120 },
  });
}

/** Numbered section heading ("1. Site Data:") using the shared numbering definition. */
export function sectionHeading(text: string, opts: { pageBreakBefore?: boolean } = {}): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    numbering: { reference: NUMBERING_REF, level: 0 },
    pageBreakBefore: opts.pageBreakBefore,
    keepNext: true,
    children: [new TextRun({ text })],
  });
}

/** Sub-heading inside a section ("Install:", "Passive Power:"). */
export function subHeading(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text })] });
}

export const note = (text: string): Paragraph => para(text, { italics: true, color: THEME.muted, size: 18 });

// ───────────── tables ─────────────

export interface Column {
  header: string;
  /** Relative weight; widths are scaled to the table width. */
  weight: number;
  align?: 'left' | 'center';
}

export interface CellSpec {
  text: string;
  bold?: boolean;
  color?: string;
  fill?: string;
  span?: number;
}

export type CellInput = string | number | null | CellSpec;

const single: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const double: IBorderOptions = { style: BorderStyle.DOUBLE, size: 4, color: '000000' };

function borders(kind: 'single' | 'double' | 'none') {
  const b = kind === 'double' ? double : kind === 'single' ? single : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b };
}

const toSpec = (c: CellInput): CellSpec => (c !== null && typeof c === 'object' ? c : { text: c === null ? '' : String(c) });

export function cell(input: CellInput, width: number, opts: { size?: number; align?: 'left' | 'center'; header?: boolean } = {}): TableCell {
  const c = toSpec(input);
  const lines = c.text.split('\n');
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: c.span,
    verticalAlign: VerticalAlign.CENTER,
    shading: c.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: c.fill } : undefined,
    margins: { top: 30, bottom: 30, left: 70, right: 70 },
    children: lines.map(
      (line) =>
        new Paragraph({
          alignment: opts.align === 'center' ? AlignmentType.CENTER : undefined,
          bidirectional: hasArabic(line) && !/[A-Za-z]/.test(line) ? true : undefined,
          spacing: { after: 0 },
          children: [run(line, { bold: c.bold ?? opts.header, color: c.color ?? (opts.header ? 'FFFFFF' : undefined), size: opts.size })],
        }),
    ),
  });
}

export interface TableOptions {
  width?: number;
  /** Half-points for body text. */
  size?: number;
  border?: 'single' | 'double' | 'none';
  headerFill?: string;
  /** Repeat the header row on every page (long tables). */
  repeatHeader?: boolean;
}

/** Table with a styled header row; widths derive from column weights. */
export function dataTable(columns: Column[], rows: CellInput[][], opts: TableOptions = {}): Table {
  const width = opts.width ?? PORTRAIT_WIDTH;
  const total = columns.reduce((a, c) => a + c.weight, 0);
  const widths = columns.map((c) => Math.floor((c.weight / total) * width));
  const size = opts.size ?? 18;
  const header = new TableRow({
    tableHeader: opts.repeatHeader ?? true,
    cantSplit: true,
    children: columns.map((c, i) => cell({ text: c.header, fill: opts.headerFill ?? THEME.headerFill }, widths[i]!, { size, align: 'center', header: true })),
  });
  const body = rows.map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: r.map((c, i) => {
          const spec = toSpec(c);
          const w = widths.slice(i, i + (spec.span ?? 1)).reduce((a, b) => a + b, 0);
          return cell(spec, w, { size, align: columns[i]?.align });
        }),
      }),
  );
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: borders(opts.border ?? 'single'),
    rows: [header, ...body],
  });
}

/** Label/value grid (SID "Site Data" style: shaded labels, double borders). */
export function labelValueTable(title: string, pairs: [string, string][], width = PORTRAIT_WIDTH): Table {
  const w = [0.18, 0.32, 0.2, 0.3].map((f) => Math.floor(f * width));
  const rows: TableRow[] = [
    new TableRow({ children: [cell({ text: title, bold: true, fill: THEME.labelFill, span: 4 }, width, { size: 20 })] }),
  ];
  for (let i = 0; i < pairs.length; i += 2) {
    const a: [string, string] = pairs[i]!;
    const b: [string, string] = pairs[i + 1] ?? ['', ''];
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell({ text: a[0], fill: THEME.labelFill }, w[0]!, { size: 20 }),
          cell({ text: a[1], bold: true, color: THEME.accent }, w[1]!, { size: 20 }),
          cell({ text: b[0], fill: THEME.labelFill }, w[2]!, { size: 20 }),
          cell({ text: b[1], bold: true, color: THEME.accent }, w[3]!, { size: 20 }),
        ],
      }),
    );
  }
  return new Table({ width: { size: width, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders: borders('double'), rows });
}

export const statusColor = (s: 'pass' | 'fail' | 'pending' | 'manual' | 'na'): string | undefined =>
  s === 'pass' ? THEME.pass : s === 'fail' ? THEME.fail : s === 'pending' ? THEME.pending : s === 'na' ? THEME.muted : undefined;

/** Block element of a section body. */
export type Block = Paragraph | Table;
