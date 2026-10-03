import type { z } from 'zod';
import type { BomRow, PassiveItem, SiteData } from '../schemas.js';
import { readDocxContent, type DocxContent } from '../docx/tables.js';

export type SiteDataT = z.infer<typeof SiteData>;
export type BomRowT = z.infer<typeof BomRow>;
export type PassiveItemT = z.infer<typeof PassiveItem>;

/** cell values separate sub-values with "/" or paragraph breaks */
const SEP = /[/\n]/;
const normLabel = (s: string): string => s.replace(/[:：]\s*$/, '').replace(/\s+/g, ' ').trim();
const nz = (s: string | undefined): string | null => (s && s.trim() ? s.trim() : null);

/**
 * "Site Data" is a 4-column grid: label | value | label | value. Merged cells make some rows
 * 5 cells wide (label | value | extra value | label | value) and the title row 1 cell wide.
 * Rule: first cell = label, last two = (label, value), anything in between extends the first value.
 */
export function parseLabelValueRows(rows: string[][]): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const cells of rows) {
    if (cells.length === 2) {
      raw[normLabel(cells[0]!)] = cells[1]!;
    } else if (cells.length >= 4) {
      const mid = cells.slice(1, -2).filter(Boolean).join(' / ');
      raw[normLabel(cells[0]!)] = mid;
      raw[normLabel(cells.at(-2)!)] = cells.at(-1)!;
    }
  }
  return raw;
}

function pick(raw: Record<string, string>, re: RegExp): string | null {
  const key = Object.keys(raw).find((k) => re.test(k));
  return key ? nz(raw[key]?.replace(/\s*\n\s*/g, ' / ')) : null;
}

export function parseSiteData(raw: Record<string, string>): SiteDataT {
  const device = pick(raw, /^Device Brand/i);
  const [brand, model, serial] = device ? device.split(SEP).map((s) => s.trim()) : [];
  const hostLoop = pick(raw, /^Device Hostname/i);
  const [hostname, loopback] = hostLoop ? hostLoop.split(SEP).map((s) => s.trim()) : [];
  const room = pick(raw, /^Room Name/i);
  return {
    siteName: pick(raw, /^Site Name/i),
    region: pick(raw, /^Sector|Region/i),
    room,
    racks: pick(raw, /Racks/i),
    project: pick(raw, /^Project Name/i),
    deviceBrand: nz(brand),
    deviceModel: nz(model),
    deviceSerial: nz(serial),
    hostname: nz(hostname),
    loopbackIp: nz(loopback),
    managementSource: pick(raw, /^Source of Management/i),
    installationType: pick(raw, /^Type of installation/i),
    gps: pick(raw, /^GPS/i),
    contractNumber: pick(raw, /^Contract Number/i),
    announcementDate: pick(raw, /^Announcement Date/i),
    installationDate: pick(raw, /^Installation date/i),
    contractor: pick(raw, /^Contractor/i),
    raw,
  };
}

const tableAfter = (c: DocxContent, re: RegExp) => c.tables.find((t) => re.test(t.heading ?? ''));

export function parseSidContent(c: DocxContent): {
  siteData: SiteDataT;
  bom: BomRowT[];
  passivePower: PassiveItemT[];
  telcoPassive: PassiveItemT[];
} {
  const sd = tableAfter(c, /^Site Data/i);
  if (!sd) throw new Error('SID: "Site Data" table not found');

  const bomTable = tableAfter(c, /Active\s*&\s*Passive/i);
  const bom: BomRowT[] = (bomTable?.rows ?? [])
    .slice(1)
    .filter((r) => /^\d+$/.test(r[0] ?? ''))
    .map((r) => ({
      seq: Number(r[0]),
      partNumber: r[1]!,
      qty: Number(r[2]),
      serials: (r[3] ?? '').split(SEP).map((s) => s.trim()).filter(Boolean),
    }));

  const items = (re: RegExp): PassiveItemT[] =>
    (tableAfter(c, re)?.rows ?? []).slice(1).filter((r) => r[0]).map((r) => ({
      description: r[0]!,
      unit: nz(r[1]),
      qty: r[2] && Number.isFinite(Number(r[2])) ? Number(r[2]) : null,
    }));

  return {
    siteData: parseSiteData(parseLabelValueRows(sd.rows)),
    bom,
    passivePower: items(/^Passive Power/i),
    telcoPassive: items(/^Telco Passive/i),
  };
}

export async function parseSidFile(file: string) {
  return parseSidContent(await readDocxContent(file));
}
