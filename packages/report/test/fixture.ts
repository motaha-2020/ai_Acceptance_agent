import JSZip from 'jszip';
import { emptySiteData, parseDocxContent, type DocxContent } from '@acceptance/parsers';
import type { ReportData } from '../src/index.js';

/** 1x1 PNG. */
export const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64'));

export function fixture(over: Partial<ReportData> = {}): ReportData {
  return {
    meta: { reportId: 'rep_1', version: 3, draft: false, generatedAt: '2026-10-03T10:00:00.000Z', generatedBy: { name: 'Pat Manager', role: 'pm' } },
    project: { code: 'TE-BIG-EDGE', name: 'TE BIG-EDGE', clientName: 'Telecom Egypt' },
    site: { code: 'nasr3-r21c', name: 'NASR3 (R21C)', exchange: 'NASR3', nameAr: 'نصر3' },
    siteData: { ...emptySiteData(), siteName: 'NASR3…C', region: 'القاهره', hostname: 'HOST-1', loopbackIp: '10.0.0.1', deviceBrand: 'CISCO', deviceModel: 'ASR-9906', deviceSerial: 'CH1', contractor: 'RAYA Integration' },
    inventory: {
      hostname: 'HOST-1',
      capturedAt: null,
      entries: [
        { name: 'Rack 0', descr: 'Chassis', pid: 'ASR-9906', vid: 'V01', sn: 'CH1', kind: 'chassis', slot: null },
        { name: '0/RSP0', descr: 'RSP', pid: 'A9K-RSP5-X-SE', vid: null, sn: 'RP1', kind: 'route_processor', slot: '0/RSP0' },
        { name: '0/RSP1', descr: 'RSP', pid: 'A9K-RSP5-X-SE', vid: null, sn: 'RP2', kind: 'route_processor', slot: '0/RSP1' },
        { name: '0/PT0-PM0', descr: '4.4kW DC Power Module', pid: 'PWR-4.4KW-DC-V3', vid: null, sn: 'PM1', kind: 'power_module', slot: '0/PT0-PM0' },
      ],
    },
    lld: {
      title: 'IP Core LLD', site: 'NASR3', author: 'Eng. A', date: '14/12/2025',
      install: [{ hostname: 'HOST-1', routerFunction: 'PE Router', node: null, type: null, project: null }],
      internalLinks: [{ parentRouter: 'HOST-1', parentInterface: 'Te0/0/0/30', childRouter: 'PEER-1', childInterface: 'Te0/2/0/0', cost: 10 }],
    },
    bom: {
      active: [{ partNumber: 'ASR-9906', qty: 1, serials: ['CH1'] }, { partNumber: 'A9K-RSP5-X-SE', qty: 2, serials: ['RP1', 'RP2'] }],
      activeSource: 'sid',
      passivePower: [{ description: 'Power Cable 16mm', unit: 'PCS', qty: 10 }],
      telcoPassive: [{ description: 'ProRack 42U', unit: 'PCS', qty: 2 }],
    },
    portMap: [{ port: 'Te0/0/0/30', cc: { odf: 1, panel: 'A', fibers: [1, 2] }, tie: { odf: 3, panel: 'A', fibers: [1, 2] }, uplink: { peerDevice: 'PEER-1', peerPort: 'Te0/2/0/0' } }],
    utilization: [{ title: 'HOST-1 // ODF (01) CC', odf: 1, kind: 'CC', entries: [{ panel: 'A', fiber: 1, port: 'Te0/0/0/30' }, { panel: 'A', fiber: 2, port: null }, { panel: 'B', fiber: 1, port: null }, { panel: 'B', fiber: 2, port: null }] }],
    fiberTests: [{ odf: 1, layout: 'panel_by_fiber', measurements: [{ panel: 'A', fibers: [1], direction: null, lossDb: 0.4 }, { panel: 'A', fibers: [2], direction: null, lossDb: 8 }], summary: { count: 2, minDb: 0.4, maxDb: 8, meanDb: 4.2 } }],
    survey: { V1: { value: '3 Good' } },
    photoStats: [
      { category: 'rack', status: 'approved', count: 4 },
      { category: 'duct', status: 'pending_review', count: 2 },
      { category: 'patch_cords', status: 'approved', count: 3 },
    ],
    snags: [
      { code: 'RACK_DOOR_NOT_CLOSED', category: 'rack', status: 'verified' },
      { code: 'PATCH_CORD_NOT_BUNDLED', category: 'patch_cords', status: 'open' },
    ],
    gallery: [
      { id: 'p1', category: 'rack', image: PNG, mime: 'png', width: 1200, height: 1600, device: 'HOST-1', capturedAt: '2026-01-20T10:32:00.000Z' },
      { id: 'p2', category: 'rack', image: PNG, mime: 'png', width: 1600, height: 1200, device: 'HOST-1', capturedAt: null },
      { id: 'p3', category: 'patch_cords', image: PNG, mime: 'png', width: 800, height: 600, device: null, capturedAt: null },
    ],
    ai: { models: [{ provider: 'claude', model: 'claude-sonnet-5-5', promptVersion: 'p7', analyses: 9 }], reviews: 9, agreementRate: 0.889 },
    reviewers: [{ name: 'Rita Reviewer', role: 'reviewer' }],
    warnings: ['fiber test ODF1 panel A fibers 2 : loss 8 dB (> 3 dB)'],
    ...over,
  };
}

export interface Unpacked {
  xml: string;
  content: DocxContent;
  zip: JSZip;
}

export async function unpack(buf: Uint8Array): Promise<Unpacked> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  return { xml, content: parseDocxContent(xml), zip };
}
