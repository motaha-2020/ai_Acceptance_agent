import type { FileInput } from './input.js';
import type { Lld } from './schemas.js';
import { readDocxContent, tableRecords, type DocxContent } from './docx/tables.js';

const nz = (s: string | undefined): string | null => (s && s.trim() ? s.trim() : null);

const sameHeader = (rows: string[][], expected: string[]): boolean =>
  expected.length === (rows[0]?.length ?? -1) && expected.every((h, i) => rows[0]![i]!.toLowerCase() === h.toLowerCase());

/** Extract install table + new internal links from an IP-core LLD docx (already read as content). */
export function parseLldContent(content: DocxContent): Lld {
  const { paragraphs, tables } = content;
  const siteIdx = paragraphs.findIndex((p) => /^Site:/i.test(p));
  const site = siteIdx >= 0 ? paragraphs[siteIdx]!.replace(/^Site:\s*/i, '') : null;
  const dateP = paragraphs.find((p) => /^Date:/i.test(p));
  const nextP = siteIdx >= 0 ? paragraphs[siteIdx + 1] : undefined;
  const author = nextP && !/^Date:/i.test(nextP) ? nextP : null;

  const install: Lld['install'] = [];
  const internalLinks: Lld['internalLinks'] = [];

  for (const t of tables) {
    const isInstall = sameHeader(t.rows, ['Hostname', 'Router Function', 'Node', 'Type', 'Project']);
    if (isInstall && (t.heading ?? '').toLowerCase() === 'install') {
      for (const r of tableRecords(t.rows)) {
        install.push({
          hostname: r['Hostname']!,
          routerFunction: r['Router Function']!,
          node: nz(r['Node']),
          type: nz(r['Type']),
          project: nz(r['Project']),
        });
      }
    }
    if (sameHeader(t.rows, ['Parent Router', 'Parent Interface', 'Child Router', 'Child Interface', 'Cost'])) {
      for (const r of tableRecords(t.rows)) {
        const cost = Number(r['Cost']);
        internalLinks.push({
          parentRouter: r['Parent Router']!,
          parentInterface: r['Parent Interface']!,
          childRouter: r['Child Router']!,
          childInterface: r['Child Interface']!,
          cost: Number.isFinite(cost) && r['Cost'] !== '' ? cost : null,
        });
      }
    }
  }

  return {
    title: paragraphs[0] ?? null,
    site,
    author,
    date: dateP ? dateP.replace(/^Date:\s*/i, '') : null,
    install,
    internalLinks,
  };
}

export async function parseLldFile(file: FileInput): Promise<Lld> {
  return parseLldContent(await readDocxContent(file));
}
