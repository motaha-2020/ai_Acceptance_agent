import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  bomFromInventory,
  crossCheck,
  EMPTY_TECHNICAL,
  guessKind,
  mergeTechnical,
  parseShowInventory,
  parseSiteDocuments,
  SiteTechnical,
  type SiteSeed,
} from '../src/index.js';

const INVENTORY = [
  'RP/0/RSP0/CPU0:HOST-A#show inventory',
  'NAME: "Rack 0", DESCR: "ASR 9906 Chassis"',
  'PID: ASR-9906          , VID: V01, SN: CH1',
  'NAME: "0/RSP0", DESCR: "ASR 9000 Route Switch Processor 5"',
  'PID: A9K-RSP5-X-SE     , VID: V03, SN: RP1',
  'NAME: "0/RSP1", DESCR: "ASR 9000 Route Switch Processor 5"',
  'PID: A9K-RSP5-X-SE     , VID: V03, SN: RP2',
  'NAME: "TenGigE0/0/0/30", DESCR: "10GBASE-LR SFP+"',
  'PID: SFP-10G-LR        , VID: V01, SN: TX1',
].join('\n');

async function xlsx(rows: (string | number | null)[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('guessKind', () => {
  it('classifies customer file names', () => {
    expect(guessKind('NASR3-R21C-C-EG#show inventory.txt')).toBe('inventory');
    expect(guessKind('Fiber Test ODF2.xlsx')).toBe('fiber_test');
    expect(guessKind('X      ODF (03) TIE_utilization sheet.xlsx')).toBe('utilization');
    expect(guessKind('X_Slot1_odf mapping.xlsx')).toBe('port_mapping');
    expect(guessKind('NASR3...C.docx')).toBe('lld');
    expect(guessKind('PO17...SID...NASR3-R21C-C-EG.docx')).toBe('sid');
    expect(guessKind('notes.pdf')).toBeNull();
  });
});

describe('parseSiteDocuments (in-memory uploads)', () => {
  it('parses inventory text, mapping and fiber test buffers and reports failures per file', async () => {
    const mapping = await xlsx([['SLOT0'], ['FROM', 'TO ODF(1) CC', 'TO ODF(3) TIE', 'UPLINK'], ['R21C- Te 0/0/0/30', 'ODF 1 - A(1,2)', 'ODF 3 - A(1,2)', 'PEER-1 Te0/2/0/0']]);
    const fiber = await xlsx([[null, 1, 2], ['A', 0.4, 0.5]]);
    const res = await parseSiteDocuments([
      { name: 'h#show inventory.txt', data: new TextEncoder().encode(INVENTORY) },
      { name: 'h_Slot0_odf mapping.xlsx', data: mapping },
      { name: 'Fiber Test ODF1.xlsx', data: fiber },
      { name: 'broken utilization sheet.xlsx', data: fiber },
      { name: 'readme.md', data: new Uint8Array() },
    ]);
    expect(res.update.inventory?.hostname).toBe('HOST-A');
    expect(res.update.portMap).toEqual([{ port: 'Te0/0/0/30', cc: { odf: 1, panel: 'A', fibers: [1, 2] }, tie: { odf: 3, panel: 'A', fibers: [1, 2] }, uplink: { peerDevice: 'PEER-1', peerPort: 'Te0/2/0/0' } }]);
    expect(res.update.fiberTests?.[0]?.summary).toMatchObject({ count: 2, maxDb: 0.5 });
    expect(res.documents.map((d) => d.kind)).toEqual(['inventory', 'port_mapping', 'fiber_test']);
    expect(res.failures.map((f) => f.name)).toEqual(['broken utilization sheet.xlsx', 'readme.md']);
  });
});

describe('mergeTechnical', () => {
  it('replaces single-file kinds and merges multi-file kinds by key', () => {
    const fiber = (odf: number, loss: number) => ({ odf, layout: 'panel_by_fiber' as const, measurements: [{ panel: 'A', fibers: [1], direction: null, lossDb: loss }], summary: { count: 1, minDb: loss, maxDb: loss, meanDb: loss } });
    const a = mergeTechnical(EMPTY_TECHNICAL, { fiberTests: [fiber(2, 0.1), fiber(1, 0.2)] });
    const b = mergeTechnical(a, { fiberTests: [fiber(2, 0.9)] });
    expect(b.fiberTests.map((t) => [t.odf, t.summary.maxDb])).toEqual([[1, 0.2], [2, 0.9]]);
    expect(SiteTechnical.parse(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
});

describe('bomFromInventory', () => {
  it('groups by PID with chassis first and keeps serials', () => {
    expect(bomFromInventory(parseShowInventory(INVENTORY))).toEqual([
      { partNumber: 'ASR-9906', description: 'ASR 9906 Chassis', qty: 1, serials: ['CH1'] },
      { partNumber: 'A9K-RSP5-X-SE', description: 'ASR 9000 Route Switch Processor 5', qty: 2, serials: ['RP1', 'RP2'] },
      { partNumber: 'SFP-10G-LR', description: '10GBASE-LR SFP+', qty: 1, serials: ['TX1'] },
    ]);
  });
});

describe('crossCheck presence guards', () => {
  const inv = parseShowInventory(INVENTORY);
  const seed: Omit<SiteSeed, 'warnings'> = {
    siteId: 's', sourceFolder: '', inventorySummary: {},
    siteData: { siteName: null, region: null, room: null, racks: null, project: null, deviceBrand: null, deviceModel: null, deviceSerial: 'OTHER', hostname: null, loopbackIp: null, managementSource: null, installationType: null, gps: null, contractNumber: null, announcementDate: null, installationDate: null, contractor: null, raw: {} },
    device: { hostname: inv.hostname, platform: 'ASR-9906', chassisSerial: 'CH1', modules: inv.entries.filter((e) => e.kind !== 'transceiver'), transceivers: inv.entries.filter((e) => e.kind === 'transceiver') },
    lld: { title: null, site: null, author: null, date: null, install: [], internalLinks: [] },
    portMap: [], utilization: [], fiberTests: [], sidBom: [], passivePower: [], telcoPassive: [],
  };
  it('skips inventory-vs-BOM when no BOM exists', () => {
    const w = crossCheck(seed, { inventory: true, bom: false, lld: false, portMap: false, siteData: true });
    expect(w.some((x) => x.includes('SID BOM'))).toBe(false);
    expect(w).toContain('SID device serial OTHER != inventory chassis serial CH1');
  });
  it('runs every check by default', () => {
    expect(crossCheck(seed).some((x) => x.startsWith('inventory serials not in SID BOM'))).toBe(true);
  });
});

// Real NASR3 sources (read-only customer folder, absent in CI).
const RAW = path.resolve(import.meta.dirname, '../../../../NASR3...C(R21C)/NASR3...C(R21C)');
describe.skipIf(!existsSync(RAW))('real NASR3 source files', () => {
  it('parses every source document from bytes', async () => {
    const files: { name: string; data: Uint8Array }[] = [];
    for (const dir of ['', 'LLD', 'Mapping Sheet', 'Fiber Test']) {
      for (const n of await readdir(path.join(RAW, dir))) {
        if (/\.(txt|xlsx|docx)$/i.test(n)) files.push({ name: n, data: await readFile(path.join(RAW, dir, n)) });
      }
    }
    const res = await parseSiteDocuments(files);
    expect(res.failures).toEqual([]);
    expect(res.update.inventory?.hostname).toBe('NASR3-R21C-C-EG');
    expect(res.update.portMap).toHaveLength(80);
    expect(res.update.utilization).toHaveLength(4);
    expect(res.update.fiberTests).toHaveLength(4);
    expect(res.update.lld?.internalLinks.length).toBeGreaterThan(0);
    expect(res.update.siteData?.hostname).toBe('NASR3-R21C-C-EG');
    expect(res.update.sidBom).toHaveLength(9);
  });
});
