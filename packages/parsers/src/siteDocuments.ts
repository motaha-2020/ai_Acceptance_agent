import { readDocxContent } from './docx/tables.js';
import { parseFiberTestSheet } from './fiberTest.js';
import { fileName, type FileInput } from './input.js';
import { parseShowInventoryFile } from './inventory.js';
import { parseLldContent } from './lld.js';
import { parsePortMappingSheet, parseUtilizationSheet } from './mapping.js';
import { parseSidContent } from './sid.js';
import type { SiteDocumentKind, TechnicalUpdate } from './technical.js';

export interface ParsedDocument {
  name: string;
  kind: SiteDocumentKind;
  /** Short human summary, e.g. "80 port rows". */
  summary: string;
}

export interface ParseFailure {
  name: string;
  error: string;
}

export interface ParsedSiteDocuments {
  update: TechnicalUpdate;
  documents: ParsedDocument[];
  failures: ParseFailure[];
}

/** Guess the document kind from the file name (extension + customer naming conventions). */
export function guessKind(name: string): SiteDocumentKind | null {
  const n = name.toLowerCase();
  if (n.endsWith('.txt')) return 'inventory';
  if (n.endsWith('.xlsx')) {
    if (/fiber\s*test|splic/.test(n)) return 'fiber_test';
    if (/utili[sz]ation/.test(n)) return 'utilization';
    if (/mapping/.test(n)) return 'port_mapping';
    return null;
  }
  if (n.endsWith('.docx')) return /\bsid\b|site information/.test(n.replace(/[._]+/g, ' ')) ? 'sid' : 'lld';
  return null;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Parse uploaded site source files into a technical-data update. Each file is parsed on its own;
 * a file that fails is reported in `failures` and does not stop the others.
 * `kinds` lets the caller force a kind per file name when the name is not conventional.
 */
export async function parseSiteDocuments(files: FileInput[], kinds: Record<string, SiteDocumentKind> = {}): Promise<ParsedSiteDocuments> {
  const update: TechnicalUpdate = {};
  const documents: ParsedDocument[] = [];
  const failures: ParseFailure[] = [];

  for (const file of files) {
    const name = fileName(file);
    const kind = kinds[name] ?? guessKind(name);
    if (!kind) {
      failures.push({ name, error: 'Unknown document type (expected show inventory .txt, LLD/SID .docx, mapping/utilization/fiber test .xlsx)' });
      continue;
    }
    try {
      documents.push({ name, kind, summary: await parseInto(update, kind, file) });
    } catch (e) {
      failures.push({ name, error: errText(e) });
    }
  }
  return { update, documents, failures };
}

async function parseInto(update: TechnicalUpdate, kind: SiteDocumentKind, file: FileInput): Promise<string> {
  switch (kind) {
    case 'inventory': {
      const inv = await parseShowInventoryFile(file);
      if (!inv.entries.length) throw new Error('No NAME/PID entries found (is this `show inventory` output?)');
      update.inventory = inv;
      return `${inv.entries.length} inventory entries for ${inv.hostname || 'unknown host'}`;
    }
    case 'lld': {
      const lld = parseLldContent(await readDocxContent(file));
      if (!lld.install.length && !lld.internalLinks.length) throw new Error('No Install or Internal Links table found in the LLD');
      update.lld = lld;
      return `${lld.install.length} install rows, ${lld.internalLinks.length} internal links`;
    }
    case 'sid': {
      const sid = parseSidContent(await readDocxContent(file));
      update.siteData = sid.siteData;
      update.sidBom = sid.bom;
      update.passivePower = sid.passivePower;
      update.telcoPassive = sid.telcoPassive;
      return `site data + ${sid.bom.length} active, ${sid.passivePower.length} passive power, ${sid.telcoPassive.length} telco passive BOM rows`;
    }
    case 'port_mapping': {
      const rows = await parsePortMappingSheet(file);
      update.portMap = [...(update.portMap ?? []), ...rows];
      return `${rows.length} port rows`;
    }
    case 'utilization': {
      const sheet = await parseUtilizationSheet(file);
      update.utilization = [...(update.utilization ?? []), sheet];
      return `ODF ${sheet.odf} ${sheet.kind}: ${sheet.entries.length} positions`;
    }
    case 'fiber_test': {
      const sheet = await parseFiberTestSheet(file);
      update.fiberTests = [...(update.fiberTests ?? []), sheet];
      return `ODF ${sheet.odf ?? '?'}: ${sheet.summary.count} measurements, max ${sheet.summary.maxDb} dB`;
    }
  }
}
