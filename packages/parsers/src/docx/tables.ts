import { XMLParser } from 'fast-xml-parser';
import type { FileInput } from '../input.js';
import { openDocx, readZipText } from './openDocx.js';

export interface DocxTable {
  /** last non-empty paragraph text before the table (usually its heading) */
  heading: string | null;
  /** previous non-empty paragraph texts since the prior table (oldest first) */
  context: string[];
  rows: string[][];
}

export interface DocxContent {
  paragraphs: string[];
  tables: DocxTable[];
}

type Node = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
});

const keyOf = (n: Node): string | undefined => Object.keys(n).find((k) => k !== ':@');

/** Visible text of a node list; paragraphs inside are separated by "\n". Skips mc:Fallback duplicates. */
function textOf(nodes: Node[]): string {
  let s = '';
  for (const n of nodes) {
    const k = keyOf(n);
    if (!k || k === '#text' || k === 'mc:Fallback') continue;
    const ch = n[k] as Node[];
    if (k === 'w:t') s += ch.map((c) => String(c['#text'] ?? '')).join('');
    else if (k === 'w:tab' || k === 'w:br') s += ' ';
    else if (Array.isArray(ch)) s += textOf(ch);
    if (k === 'w:p') s += '\n';
  }
  return s;
}

const clean = (s: string): string => s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/** Top-level paragraphs and tables of word/document.xml in body order. */
export function parseDocxContent(documentXml: string): DocxContent {
  const tree = parser.parse(documentXml) as Node[];
  const doc = tree.find((n) => 'w:document' in n)?.['w:document'] as Node[] | undefined;
  const body = doc?.find((n) => 'w:body' in n)?.['w:body'] as Node[] | undefined;
  if (!body) throw new Error('No w:body in document.xml');

  const paragraphs: string[] = [];
  const tables: DocxTable[] = [];
  let sinceTable: string[] = [];
  for (const block of body) {
    const k = keyOf(block);
    if (k === 'w:p') {
      const t = clean(textOf(block['w:p'] as Node[]));
      if (t) {
        paragraphs.push(t);
        sinceTable.push(t);
      }
    } else if (k === 'w:tbl') {
      const rows = (block['w:tbl'] as Node[])
        .filter((n) => 'w:tr' in n)
        .map((tr) =>
          (tr['w:tr'] as Node[]).filter((n) => 'w:tc' in n).map((tc) => clean(textOf(tc['w:tc'] as Node[]))),
        );
      tables.push({ heading: sinceTable.at(-1) ?? null, context: sinceTable, rows });
      sinceTable = [];
    }
  }
  return { paragraphs, tables };
}

export async function readDocxContent(file: FileInput): Promise<DocxContent> {
  const zip = await openDocx(file);
  return parseDocxContent(await readZipText(zip, 'word/document.xml'));
}

/** Map a table with a header row into records keyed by header text. */
export function tableRecords(rows: string[][]): Array<Record<string, string>> {
  const [header, ...rest] = rows;
  if (!header) return [];
  return rest
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
