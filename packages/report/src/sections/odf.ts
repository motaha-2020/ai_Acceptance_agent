import type { FiberTestSheet, UtilizationSheet } from '@acceptance/parsers';
import type { ReportData } from '../data.js';
import { LOSS_LIMIT_DB } from '../checklist/derive.js';
import { dataTable, LANDSCAPE_WIDTH, note, para, sectionHeading, subHeading, THEME, type Block, type CellInput } from '../docx/primitives.js';
import { fiberRefText } from './network.js';
import { headingOf } from './titles.js';

const USED_FILL = 'E2EFDA';
const sortPanels = (panels: Iterable<string>): string[] => [...new Set(panels)].sort();

/** 12x12 utilization grid: rows = fiber 1..n, columns = panels A..L, cell = router port. */
export function utilizationGrid(sheet: UtilizationSheet): Block {
  const panels = sortPanels(sheet.entries.map((e) => e.panel));
  const fibers = [...new Set(sheet.entries.map((e) => e.fiber))].sort((a, b) => a - b);
  const at = new Map(sheet.entries.map((e) => [`${e.panel}:${e.fiber}`, e.port]));
  const rows: CellInput[][] = fibers.map((f) => [
    { text: String(f), bold: true, fill: THEME.labelFill },
    ...panels.map((p): CellInput => {
      const port = at.get(`${p}:${f}`);
      return port ? { text: port, fill: USED_FILL } : '';
    }),
  ]);
  return dataTable([{ header: 'Fiber', weight: 0.7, align: 'center' }, ...panels.map((p) => ({ header: p, weight: 1, align: 'center' as const }))], rows, {
    width: LANDSCAPE_WIDTH,
    size: 13,
  });
}

const lossCell = (loss: number | undefined): CellInput =>
  loss === undefined ? '' : loss > LOSS_LIMIT_DB || loss < 0 ? { text: String(loss), bold: true, color: THEME.fail } : String(loss);

/** Fiber test sheet in its source layout (panel x fiber, or fiber pair + TX/RX x panel). */
export function fiberTestTable(sheet: FiberTestSheet): Block {
  const panels = sortPanels(sheet.measurements.map((m) => m.panel));
  if (sheet.layout === 'panel_by_fiber') {
    const fibers = [...new Set(sheet.measurements.flatMap((m) => m.fibers))].sort((a, b) => a - b);
    const at = new Map(sheet.measurements.map((m) => [`${m.panel}:${m.fibers[0]}`, m.lossDb]));
    return dataTable(
      [{ header: 'Panel', weight: 0.8, align: 'center' }, ...fibers.map((f) => ({ header: String(f), weight: 1, align: 'center' as const }))],
      panels.map((p) => [{ text: p, bold: true, fill: THEME.labelFill }, ...fibers.map((f) => lossCell(at.get(`${p}:${f}`)))]),
      { width: LANDSCAPE_WIDTH, size: 15 },
    );
  }
  const keys = [...new Set(sheet.measurements.map((m) => `${m.fibers.join(',')}|${m.direction ?? ''}`))];
  const at = new Map(sheet.measurements.map((m) => [`${m.fibers.join(',')}|${m.direction ?? ''}|${m.panel}`, m.lossDb]));
  return dataTable(
    [{ header: 'Fibers', weight: 1, align: 'center' }, { header: 'TX/RX', weight: 0.8, align: 'center' }, ...panels.map((p) => ({ header: p, weight: 1, align: 'center' as const }))],
    keys.map((k) => {
      const [pair, dir] = k.split('|') as [string, string];
      return [{ text: pair, bold: true, fill: THEME.labelFill }, dir, ...panels.map((p) => lossCell(at.get(`${k}|${p}`)))];
    }),
    { width: LANDSCAPE_WIDTH, size: 14 },
  );
}

/** ODF utilization grids + router port mapping (the SID embeds the Excel sheets here). */
export function buildOdf(data: ReportData): Block[] {
  const blocks: Block[] = [sectionHeading(`${headingOf('odf')}:`), subHeading('ODF Utilization sheet')];
  if (!data.utilization.length && !data.portMap.length) return [...blocks, note('No ODF utilization or port mapping imported for this site.')];
  for (const sheet of data.utilization) {
    const used = sheet.entries.filter((e) => e.port).length;
    blocks.push(para(`${sheet.title.replace(/\s+/g, ' ')} — ${used}/${sheet.entries.length} used`, { bold: true, size: 20, keepNext: true }), utilizationGrid(sheet), para(''));
  }
  if (data.portMap.length) {
    blocks.push(subHeading('Port mapping'));
    blocks.push(
      dataTable(
        [{ header: 'Router port', weight: 2 }, { header: 'Cross connect ODF', weight: 3 }, { header: 'Tie ODF', weight: 3 }, { header: 'Uplink', weight: 4 }],
        data.portMap.map((r) => [r.port, fiberRefText(r.cc), fiberRefText(r.tie), r.uplink ? `${r.uplink.peerDevice} ${r.uplink.peerPort}` : '']),
        { width: LANDSCAPE_WIDTH, size: 16 },
      ),
    );
  }
  return blocks;
}

export function buildFiberTests(data: ReportData): Block[] {
  const blocks: Block[] = [sectionHeading(`${headingOf('tests')}:`, { pageBreakBefore: true }), subHeading('Splicing test')];
  if (!data.fiberTests.length) return [...blocks, note('No fiber test results imported for this site.')];
  for (const t of data.fiberTests) {
    const s = t.summary;
    blocks.push(
      para(`Fiber Test ODF${t.odf ?? '?'} — ${s.count} readings, min ${s.minDb} dB, max ${s.maxDb} dB, mean ${s.meanDb} dB (limit ${LOSS_LIMIT_DB} dB)`, { bold: true, size: 20, keepNext: true }),
      fiberTestTable(t),
      para(''),
    );
  }
  return blocks;
}
