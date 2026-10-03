import { describe, expect, it } from 'vitest';
import { EMPTY_TECHNICAL, emptySiteData, parseShowInventory } from '@acceptance/parsers';
import { agreementRate, mergeSiteData, readTechnical, reportFileBase, selectBom, technicalWarnings } from '../src/index.js';

const site = { name: 'Site 1', region: 'Cairo', room: 'SW Room', floor: '3rd floor', racks: 2, gpsLat: 30.05, gpsLng: 31.33, projectName: 'TE BIG-EDGE', device: { model: 'ASR-9906', hostname: 'H1', serial: 'CH1', loopbackIp: '10.0.0.1' } };
const inventory = parseShowInventory(['RP/0/RSP0/CPU0:H1#show inventory', 'NAME: "Rack 0", DESCR: "Chassis"', 'PID: ASR-9906 , VID: V01, SN: CH1', 'NAME: "0/RSP0", DESCR: "RSP"', 'PID: A9K-RSP5-X-SE , VID: V01, SN: RP1'].join('\n'));

describe('mergeSiteData', () => {
  it('fills empty document fields from the site and device rows', () => {
    const sd = mergeSiteData(null, site);
    expect(sd).toMatchObject({ siteName: 'Site 1', region: 'Cairo', room: 'SW Room || 3rd floor', racks: '2', project: 'TE BIG-EDGE', hostname: 'H1', deviceSerial: 'CH1', loopbackIp: '10.0.0.1', gps: '30.05°N, 31.33°E' });
  });
  it('keeps imported SID values', () => {
    expect(mergeSiteData({ ...emptySiteData(), region: 'القاهره', hostname: 'SID-HOST' }, site)).toMatchObject({ region: 'القاهره', hostname: 'SID-HOST', siteName: 'Site 1' });
  });
});

describe('selectBom', () => {
  const lines = [
    { kind: 'passive_power', description: 'Cable', partNumber: null, qty: 10, unit: 'PCS', serials: [], source: 'sid' },
    { kind: 'telco_passive', description: 'Rack', partNumber: null, qty: 2, unit: 'PCS', serials: [], source: 'sid' },
  ];
  it('prefers delivered SID active lines', () => {
    const bom = selectBom([...lines, { kind: 'active', description: 'ASR-9906', partNumber: 'ASR-9906', qty: 1, unit: 'PCS', serials: ['CH1'], source: 'sid' }], { ...EMPTY_TECHNICAL, inventory });
    expect(bom.activeSource).toBe('sid');
    expect(bom.active).toEqual([{ partNumber: 'ASR-9906', qty: 1, serials: ['CH1'] }]);
    expect(bom.passivePower).toEqual([{ description: 'Cable', unit: 'PCS', qty: 10 }]);
  });
  it('falls back to the inventory, then to nothing', () => {
    expect(selectBom(lines, { ...EMPTY_TECHNICAL, inventory }).activeSource).toBe('inventory');
    expect(selectBom(lines, EMPTY_TECHNICAL)).toMatchObject({ activeSource: 'none', active: [] });
  });
});

describe('technicalWarnings', () => {
  it('compares inventory with the delivered BOM only when both exist', () => {
    const tech = { ...EMPTY_TECHNICAL, inventory };
    const sid = selectBom([{ kind: 'active', description: 'ASR-9906', partNumber: 'ASR-9906', qty: 1, unit: null, serials: ['CH1'], source: 'sid' }], tech);
    expect(technicalWarnings(tech, sid, emptySiteData())).toEqual(['inventory serials not in SID BOM (1): RP1']);
    expect(technicalWarnings(tech, selectBom([], tech), emptySiteData())).toEqual([]);
  });
});

describe('readTechnical', () => {
  it('drops invalid columns with a warning', () => {
    const warnings: string[] = [];
    const t = readTechnical({ portMap: [{ port: 'x' }], survey: { V1: { value: '3 Good' } } }, warnings);
    expect(t.portMap).toEqual([]);
    expect(t.survey).toEqual({ V1: { value: '3 Good' } });
    expect(warnings[0]).toMatch(/stored portMap data is invalid/);
  });
});

describe('small helpers', () => {
  it('agreementRate ignores reviews without an AI verdict', () => {
    expect(agreementRate([{ verdict: 'accept', aiVerdict: 'accept' }, { verdict: 'reject', aiVerdict: 'accept' }, { verdict: 'accept', aiVerdict: null }])).toBe(0.5);
    expect(agreementRate([])).toBeNull();
  });
  it('reportFileBase is file-system safe', () => {
    expect(reportFileBase('NASR3-R21C-C-EG', 2, true)).toBe('SID-NASR3-R21C-C-EG-v2-DRAFT');
    expect(reportFileBase('a/b c', 1, false)).toBe('SID-a-b-c-v1');
  });
});
