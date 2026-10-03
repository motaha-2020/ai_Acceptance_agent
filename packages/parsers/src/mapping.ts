import { fileName, type FileInput } from './input.js';

import type { FiberRef, PortMapRow, UtilizationSheet } from './schemas.js';
import { readGrid, str, type Cell } from './xlsx/readGrid.js';
import { shortPort } from './ports.js';

type Ref = FiberRef;
type PortRow = PortMapRow;
type Util = UtilizationSheet;

/** "ODF 1 - A(1,2)" | "ODF 3 -A(11,12)" -> {odf:1, panel:'A', fibers:[1,2]} */
export function parseFiberRef(s: string | null): Ref | null {
  if (!s) return null;
  const m = /ODF\s*\(?(\d+)\)?\s*-\s*([A-Za-z])\s*\(([\d,\s]+)\)/i.exec(s);
  if (!m) return null;
  return {
    odf: Number(m[1]),
    panel: m[2]!.toUpperCase(),
    fibers: m[3]!.split(',').map((x) => Number(x.trim())).filter(Number.isFinite),
  };
}

/** "NASR3-R30C-C-EG\tTe0/2/0/0" -> peer device + port */
export function parseUplink(s: string | null): { peerDevice: string; peerPort: string } | null {
  if (!s) return null;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { peerDevice: parts[0]!, peerPort: shortPort(parts.slice(1).join('')) };
}

/**
 * Port -> ODF mapping sheet ("SLOT0"/"SLOT1"): row 2 holds headers
 * (FROM / TO ODF(n) CC / TO ODF(m) TIE / UPLINK), following rows one port each.
 */
export async function parsePortMappingSheet(file: FileInput): Promise<PortRow[]> {
  const grid = await readGrid(file);
  const headerIdx = grid.findIndex((r) => r.some((c) => /^FROM\b/i.test(String(c ?? ''))));
  if (headerIdx < 0) throw new Error(`No FROM header in ${fileName(file)}`);
  const header = grid[headerIdx]!.map((c) => String(c ?? ''));
  const col = (re: RegExp): number => header.findIndex((h) => re.test(h));
  const fromC = col(/^FROM/i);
  const ccC = col(/\bCC\b/i);
  const tieC = col(/\bTIE\b/i);
  const upC = col(/UPLINK/i);

  const rows: PortRow[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    const from = str(r[fromC]);
    if (!from) continue;
    rows.push({
      port: shortPort(from),
      cc: ccC >= 0 ? parseFiberRef(str(r[ccC])) : null,
      tie: tieC >= 0 ? parseFiberRef(str(r[tieC])) : null,
      uplink: upC >= 0 ? parseUplink(str(r[upC])) : null,
    });
  }
  return rows;
}

const isPanelRow = (r: Cell[]): boolean => {
  const vals = r.filter((c) => c !== null);
  return vals.length >= 4 && vals.every((c) => typeof c === 'string' && /^[A-Za-z]$/.test(c));
};

/**
 * ODF utilization grid ("NASR3-R21C-C-EG // ODF (01) CC"): blocks introduced by a row of
 * panel letters (A A A A B B B B ...), each panel = 4 columns [fiber, port, fiber, port].
 */
export async function parseUtilizationSheet(file: FileInput): Promise<Util> {
  const grid = await readGrid(file);
  const title = str(grid[0]?.[0]) ?? fileName(file);
  const m = /ODF\s*\(?0*(\d+)\)?\s*(CC|TIE)/i.exec(title) ?? /ODF\s*\(?0*(\d+)\)?\s*(CC|TIE)/i.exec(fileName(file));
  if (!m) throw new Error(`Cannot read ODF number/kind from "${title}"`);

  const entries: Util['entries'] = [];
  let letters: Cell[] | null = null;
  for (const r of grid.slice(1)) {
    if (isPanelRow(r)) {
      letters = r;
      continue;
    }
    if (!letters) continue;
    for (let c = 0; c + 3 < letters.length; c += 4) {
      const panel = String(letters[c] ?? '').toUpperCase();
      if (!panel) continue;
      for (const off of [0, 2]) {
        const fiber = r[c + off];
        if (typeof fiber !== 'number') continue;
        entries.push({ panel, fiber, port: str(r[c + off + 1]) ? shortPort(str(r[c + off + 1])!) : null });
      }
    }
  }
  return { title, odf: Number(m[1]), kind: m[2]!.toUpperCase() as 'CC' | 'TIE', entries };
}
