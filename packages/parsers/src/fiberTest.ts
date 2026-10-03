import { fileName, type FileInput } from './input.js';

import type { FiberMeasurement, FiberTestSheet } from './schemas.js';
import { readGrid, str, type Cell } from './xlsx/readGrid.js';

type Sheet = FiberTestSheet;
type Measurement = FiberMeasurement;

export function summarize(ms: readonly Measurement[]): Sheet['summary'] {
  const v = ms.map((m) => m.lossDb);
  const sum = v.reduce((a, b) => a + b, 0);
  return {
    count: v.length,
    minDb: Math.min(...v),
    maxDb: Math.max(...v),
    meanDb: Math.round((sum / v.length) * 1000) / 1000,
  };
}

const isNum = (c: Cell | undefined): c is number => typeof c === 'number';

/** Layout A: header row 1..12 fibers, rows = panels A..L, cells = loss (dB). */
function parsePanelByFiber(grid: Cell[][]): Measurement[] {
  const header = grid[0]!;
  const out: Measurement[] = [];
  for (const r of grid.slice(1)) {
    const panel = str(r[0]);
    if (!panel || !/^[A-Za-z]$/.test(panel)) continue;
    header.forEach((h, c) => {
      const loss = r[c];
      if (c === 0 || !isNum(h) || !isNum(loss)) return;
      out.push({ panel: panel.toUpperCase(), fibers: [h], direction: null, lossDb: loss });
    });
  }
  return out;
}

/** Layout B: "CAST NO | TX/RX | A..L" rows are fiber pair + direction. */
function parseFiberPairByPanel(grid: Cell[][]): Measurement[] {
  const header = grid[0]!;
  const out: Measurement[] = [];
  for (const r of grid.slice(1)) {
    const pair = str(r[0]);
    const dir = str(r[1])?.toUpperCase();
    if (!pair || (dir !== 'TX' && dir !== 'RX')) continue;
    const fibers = pair.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (!fibers.length) continue;
    header.forEach((h, c) => {
      const panel = str(h);
      const loss = r[c];
      if (c < 2 || !panel || !/^[A-Za-z]$/.test(panel) || !isNum(loss)) return;
      out.push({ panel: panel.toUpperCase(), fibers, direction: dir, lossDb: loss });
    });
  }
  return out;
}

/** Fiber test sheet, either layout. ODF number is taken from the file name ("Fiber Test ODF2.xlsx"). */
export async function parseFiberTestSheet(file: FileInput): Promise<Sheet> {
  const grid = await readGrid(file);
  const first = grid[0] ?? [];
  const layout: Sheet['layout'] = /CAST/i.test(String(first[0] ?? '')) ? 'fiberpair_by_panel' : 'panel_by_fiber';
  const measurements = layout === 'fiberpair_by_panel' ? parseFiberPairByPanel(grid) : parsePanelByFiber(grid);
  if (!measurements.length) throw new Error(`No measurements parsed from ${fileName(file)}`);
  const odf = /ODF\s*0*(\d+)/i.exec(fileName(file))?.[1];
  return { odf: odf ? Number(odf) : null, layout, measurements, summary: summarize(measurements) };
}
