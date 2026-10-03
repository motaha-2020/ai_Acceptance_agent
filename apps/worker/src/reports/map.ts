import { bomFromInventory, crossCheck, emptySiteData, type BomRow, type PassiveItem, type SiteData, type SiteTechnical } from '@acceptance/parsers';
import type { ActiveBomRow } from '@acceptance/report';

/** Site/device columns used to fill site-data fields the documents did not provide. */
export interface SiteRowFacts {
  name: string;
  region: string | null;
  room: string | null;
  floor: string | null;
  racks: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  projectName: string;
  device: { model: string; hostname: string | null; serial: string | null; loopbackIp: string | null } | null;
}

const pick = (a: string | null | undefined, b: string | null | undefined): string | null => (a && a.trim() ? a : b && b.trim() ? b : null);

/** Imported SID/manual site data wins; empty fields fall back to the site and device rows. */
export function mergeSiteData(tech: SiteData | null, site: SiteRowFacts): SiteData {
  const sd = tech ?? emptySiteData();
  const room = [site.room, site.floor].filter(Boolean).join(' || ') || null;
  const gps = site.gpsLat !== null && site.gpsLng !== null ? `${site.gpsLat}°N, ${site.gpsLng}°E` : null;
  return {
    ...sd,
    siteName: pick(sd.siteName, site.name),
    region: pick(sd.region, site.region),
    room: pick(sd.room, room),
    racks: pick(sd.racks, site.racks !== null ? String(site.racks) : null),
    project: pick(sd.project, site.projectName),
    deviceModel: pick(sd.deviceModel, site.device?.model),
    deviceSerial: pick(sd.deviceSerial, site.device?.serial),
    hostname: pick(sd.hostname, site.device?.hostname),
    loopbackIp: pick(sd.loopbackIp, site.device?.loopbackIp),
    gps: pick(sd.gps, gps),
  };
}

export interface BomLineFacts {
  kind: string;
  description: string;
  partNumber: string | null;
  qty: number | null;
  unit: string | null;
  serials: string[];
  source: string;
}

export interface ReportBom {
  active: ActiveBomRow[];
  activeSource: 'sid' | 'inventory' | 'none';
  passivePower: PassiveItem[];
  telcoPassive: PassiveItem[];
}

/** Active BOM = delivered (SID) lines when present, otherwise derived from `show inventory`. */
export function selectBom(lines: BomLineFacts[], tech: SiteTechnical): ReportBom {
  const passive = (kind: string): PassiveItem[] => lines.filter((l) => l.kind === kind).map((l) => ({ description: l.description, unit: l.unit, qty: l.qty }));
  const sid = lines.filter((l) => l.kind === 'active');
  const active: ActiveBomRow[] = sid.length
    ? sid.map((l) => ({ partNumber: l.partNumber ?? l.description, qty: Math.round(l.qty ?? l.serials.length), serials: l.serials }))
    : tech.inventory
      ? bomFromInventory(tech.inventory).map(({ partNumber, qty, serials }) => ({ partNumber, qty, serials }))
      : [];
  return { active, activeSource: sid.length ? 'sid' : active.length ? 'inventory' : 'none', passivePower: passive('passive_power'), telcoPassive: passive('telco_passive') };
}

/** Cross-source checks on the current data (only between sources that exist). */
export function technicalWarnings(tech: SiteTechnical, bom: ReportBom, siteData: SiteData): string[] {
  const inv = tech.inventory;
  const sidBom: BomRow[] = bom.activeSource === 'sid' ? bom.active.map((b, i) => ({ seq: i + 1, partNumber: b.partNumber, qty: b.qty, serials: b.serials })) : [];
  const chassis = inv?.entries.find((e) => e.kind === 'chassis') ?? null;
  return crossCheck(
    {
      siteId: '',
      sourceFolder: '',
      siteData,
      device: {
        hostname: inv?.hostname ?? siteData.hostname ?? '',
        platform: chassis?.pid ?? null,
        chassisSerial: chassis?.sn ?? null,
        modules: inv?.entries.filter((e) => e.kind !== 'transceiver') ?? [],
        transceivers: inv?.entries.filter((e) => e.kind === 'transceiver') ?? [],
      },
      inventorySummary: {},
      lld: tech.lld ?? { title: null, site: null, author: null, date: null, install: [], internalLinks: [] },
      portMap: tech.portMap,
      utilization: tech.utilization,
      fiberTests: tech.fiberTests,
      sidBom,
      passivePower: bom.passivePower,
      telcoPassive: bom.telcoPassive,
    },
    { inventory: !!inv, bom: sidBom.length > 0, lld: !!tech.lld, portMap: tech.portMap.length > 0, siteData: !!tech.siteData },
  );
}

/** Share of reviews whose human verdict equals the AI verdict at review time. */
export function agreementRate(reviews: { verdict: string; aiVerdict: string | null }[]): number | null {
  const withAi = reviews.filter((r) => r.aiVerdict !== null);
  if (!withAi.length) return null;
  return withAi.filter((r) => r.verdict === r.aiVerdict).length / withAi.length;
}

/** Download file name, e.g. "SID-NASR3-R21C-C-EG-v2-DRAFT.docx". */
export function reportFileBase(hostnameOrCode: string, version: number, draft: boolean): string {
  const safe = hostnameOrCode.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
  return `SID-${safe}-v${version}${draft ? '-DRAFT' : ''}`;
}
