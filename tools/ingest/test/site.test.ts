import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDocxContent, tableRecords } from '../src/docx/tables.js';
import { parseFiberTestSheet } from '../src/site/fiberTest.js';
import { parseShowInventory } from '../src/site/inventory.js';
import { parseLldContent } from '../src/site/lld.js';
import { parseFiberRef, parsePortMappingSheet, parseUplink, parseUtilizationSheet } from '../src/site/mapping.js';
import { shortPort, slotOfInterface } from '../src/site/ports.js';
import { parseLabelValueRows, parseSiteData } from '../src/site/sid.js';

describe('ports', () => {
  it('normalises interface names', () => {
    expect(shortPort('GigabitEthernet0/0/0/1')).toBe('Gi0/0/0/1');
    expect(shortPort('R21C- Gi 0/0/0/1')).toBe('Gi0/0/0/1');
    expect(shortPort('R21C- Te 0/0/0/30')).toBe('Te0/0/0/30');
    expect(shortPort('TenGigE0/1/0/39')).toBe('Te0/1/0/39');
    expect(slotOfInterface('TenGigE0/1/0/39')).toBe('0/1');
    expect(slotOfInterface('0/RSP0')).toBeNull();
  });
});

const INVENTORY = [
  'RP/0/RSP0/CPU0:NASR3-R21C-C-EG#show inventory',
  'Thu Jan 29 09:59:10.277 +02',
  'NAME: "0/RSP0", DESCR: "ASR 9000 Route Switch Processor 5 for Service Edge-Prem"',
  'PID: A9K-RSP5-X-SE     , VID: V03, SN: FOC2901N02X',
  '',
  'NAME: "GigabitEthernet0/0/0/0", DESCR: "1000BASE-LH SFP (DOM), SMF, 10Km"',
  'PID: SFP-1G-LH         , VID: V01, SN: ACW2918009C',
  '',
  'NAME: "0/0", DESCR: "ASR 9000 400G SE combo line card"',
  'PID: A9K-4HG-FLEX-SE   , VID: V03, SN: FOC2843N3YH',
  'NAME: "Rack 0", DESCR: "ASR 9906 4 Line Card Slot Chassis"',
  'PID: ASR-9906          , VID: V01, SN: FOX2904PF5C',
  'NAME: "0/PT0-PM0", DESCR: "4.4kW DC Power Module"',
  'PID: PWR-4.4KW-DC-V3   , VID: V05, SN: DTM280702SU',
  'RP/0/RSP0/CPU0:NASR3-R21C-C-EG#',
].join('\r\n');

describe('parseShowInventory', () => {
  const inv = parseShowInventory(INVENTORY);
  it('reads hostname and capture time', () => {
    expect(inv.hostname).toBe('NASR3-R21C-C-EG');
    expect(inv.capturedAt).toContain('Jan 29 09:59:10');
  });
  it('classifies entries and keeps serials', () => {
    expect(inv.entries.map((e) => [e.name, e.kind, e.sn])).toEqual([
      ['0/RSP0', 'route_processor', 'FOC2901N02X'],
      ['GigabitEthernet0/0/0/0', 'transceiver', 'ACW2918009C'],
      ['0/0', 'line_card', 'FOC2843N3YH'],
      ['Rack 0', 'chassis', 'FOX2904PF5C'],
      ['0/PT0-PM0', 'power_module', 'DTM280702SU'],
    ]);
    expect(inv.entries[1]!.slot).toBe('0/0');
  });
});

describe('mapping strings', () => {
  it('parses ODF references including odd spacing', () => {
    expect(parseFiberRef('ODF 1 - A(1,2)')).toEqual({ odf: 1, panel: 'A', fibers: [1, 2] });
    expect(parseFiberRef('ODF 3 -A(11,12)')).toEqual({ odf: 3, panel: 'A', fibers: [11, 12] });
    expect(parseFiberRef('')).toBeNull();
    expect(parseFiberRef('garbage')).toBeNull();
  });
  it('parses uplink peers', () => {
    expect(parseUplink('NASR3-R30C-C-EG\tTe0/2/0/0')).toEqual({ peerDevice: 'NASR3-R30C-C-EG', peerPort: 'Te0/2/0/0' });
    expect(parseUplink(null)).toBeNull();
  });
});

describe('xlsx parsers', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ingest-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function save(name: string, rows: Array<Array<string | number | null>>): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    rows.forEach((r) => ws.addRow(r));
    const file = path.join(dir, name);
    await wb.xlsx.writeFile(file);
    return file;
  }

  it('port mapping sheet', async () => {
    const file = await save('map.xlsx', [
      ['H', 'H', 'H', 'H'],
      ['FROM R21C', 'TO ODF(1) CC', 'TO ODF(3) TIE', 'UPLINK'],
      ['R21C- Gi 0/0/0/0', 'ODF 1 - A(1,2)', 'ODF 3 - A(1,2)', null],
      ['R21C- Te 0/0/0/30', 'ODF 1 - F(1,2)', 'ODF 3 - F(1,2)', 'NASR3-R30C-C-EG\tTe0/2/0/0'],
      ['R21C- Te 0/0/0/36', null, 'ODF 3 - G(1,2)', null],
    ]);
    const rows = await parsePortMappingSheet(file);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ port: 'Gi0/0/0/0', cc: { odf: 1, panel: 'A', fibers: [1, 2] }, tie: { odf: 3, panel: 'A', fibers: [1, 2] }, uplink: null });
    expect(rows[1]!.uplink).toEqual({ peerDevice: 'NASR3-R30C-C-EG', peerPort: 'Te0/2/0/0' });
    expect(rows[2]!.cc).toBeNull();
  });

  it('utilization grid', async () => {
    const file = await save('NASR3-R21C-C-EG      ODF (03) TIE_utilization sheet.xlsx', [
      ['NASR3-R21C-C-EG    //  ODF (03) TIE'],
      ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'],
      [1, 'Gi0/0/0/0', 7, 'Gi0/0/0/3', 1, 'Gi0/0/0/6', 7, null],
      [2, 'Gi0/0/0/0', 8, 'Gi0/0/0/3', 2, null, 8, null],
    ]);
    const u = await parseUtilizationSheet(file);
    expect(u).toMatchObject({ odf: 3, kind: 'TIE' });
    expect(u.entries).toHaveLength(8);
    expect(u.entries).toContainEqual({ panel: 'A', fiber: 7, port: 'Gi0/0/0/3' });
    expect(u.entries).toContainEqual({ panel: 'B', fiber: 7, port: null });
  });

  it('fiber test: panel-by-fiber layout', async () => {
    const file = await save('Fiber Test ODF1.xlsx', [
      [null, 1, 2],
      ['A', 0.3, 0.7],
      ['B', 0.5, 0.8],
    ]);
    const t = await parseFiberTestSheet(file);
    expect(t).toMatchObject({ odf: 1, layout: 'panel_by_fiber' });
    expect(t.measurements).toHaveLength(4);
    expect(t.summary).toEqual({ count: 4, minDb: 0.3, maxDb: 0.8, meanDb: 0.575 });
  });

  it('fiber test: fiber-pair-by-panel layout', async () => {
    const file = await save('Fiber Test ODF2.xlsx', [
      ['CAST NO', 'CAST NO', 'A', 'B'],
      ['1,2', 'TX', 0.9, 1],
      ['1,2', 'RX', 0.5, 1.1],
    ]);
    const t = await parseFiberTestSheet(file);
    expect(t).toMatchObject({ odf: 2, layout: 'fiberpair_by_panel' });
    expect(t.measurements).toContainEqual({ panel: 'B', fibers: [1, 2], direction: 'RX', lossDb: 1.1 });
  });
});

const W = 'xmlns:w="w"';
const p = (t: string): string => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const tbl = (rows: string[][]): string =>
  `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
const docXml = (...b: string[]): string => `<w:document ${W}><w:body>${b.join('')}</w:body></w:document>`;

describe('docx tables', () => {
  it('captures heading context and records', () => {
    const c = parseDocxContent(docXml(p('Install'), tbl([['Hostname', 'Type'], ['R1', 'ASR'], ['', '']])));
    expect(c.tables[0]!.heading).toBe('Install');
    expect(tableRecords(c.tables[0]!.rows)).toEqual([{ Hostname: 'R1', Type: 'ASR' }]);
  });
});

describe('LLD', () => {
  it('extracts header info, install rows and internal links', () => {
    const c = parseDocxContent(
      docXml(
        p('IP Core LLD'), p('Site: NASR3...C (Edge)'), p('Mohamed Hassan'), p('Date: 14/12/2025'),
        p('Install'),
        tbl([['Hostname', 'Router Function', 'Node', 'Type', 'Project'], ['R21', 'PE Router', '', 'ASR-9906', '']]),
        p('Internal Links'), p('New'),
        tbl([['Parent Router', 'Parent Interface', 'Child Router', 'Child Interface', 'Cost'], ['R21', 'Te0/0/0/30', 'R30', 'Te0/2/0/0', '10']]),
      ),
    );
    const lld = parseLldContent(c);
    expect(lld).toMatchObject({ title: 'IP Core LLD', site: 'NASR3...C (Edge)', author: 'Mohamed Hassan', date: '14/12/2025' });
    expect(lld.install).toEqual([{ hostname: 'R21', routerFunction: 'PE Router', node: null, type: 'ASR-9906', project: null }]);
    expect(lld.internalLinks[0]).toEqual({ parentRouter: 'R21', parentInterface: 'Te0/0/0/30', childRouter: 'R30', childInterface: 'Te0/2/0/0', cost: 10 });
  });
});

describe('SID site data', () => {
  const rows = [
    ['Basic Information of Site/Device:'],
    ['Site Name:', 'NASR3…C', 'Sector/City/Region:', 'القاهره'],
    ['Room Name / Floor:', 'SW Room || 3rd floor', 'Area/No# Racks:', '2'],
    ['Room Name / Floor:', 'SW Room', '3rd floor', 'Area/No# Racks:', '2'],
    ['Project Name:', 'TE BIG-EDGE', 'Device Brand/Type/SN', 'CISCO/ASR-9906\nFOX2904PF5C'],
    ['Device Hostname/ loop Back IP', 'R21\n10.45.31.74', 'Source of Management:', 'R30\n10.35.235.2/30'],
  ];
  it('pairs labels and values across 2-, 4- and 5-cell rows', () => {
    const raw = parseLabelValueRows(rows);
    expect(raw['Site Name']).toBe('NASR3…C');
    expect(raw['Area/No# Racks']).toBe('2');
    expect(raw['Room Name / Floor']).toBe('SW Room / 3rd floor');
  });
  it('derives canonical fields', () => {
    const d = parseSiteData(parseLabelValueRows(rows));
    expect(d).toMatchObject({
      siteName: 'NASR3…C', region: 'القاهره', racks: '2', project: 'TE BIG-EDGE',
      deviceBrand: 'CISCO', deviceModel: 'ASR-9906', deviceSerial: 'FOX2904PF5C',
      hostname: 'R21', loopbackIp: '10.45.31.74', managementSource: 'R30 / 10.35.235.2/30',
    });
  });
});
