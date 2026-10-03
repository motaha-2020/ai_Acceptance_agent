import { z } from 'zod';
import {
  FiberTestSheet,
  InventorySchema,
  LldSchema,
  PortMapRow,
  SiteData,
  UtilizationSheet,
  type BomRow,
  type Inventory,
  type PassiveItem,
} from './schemas.js';

/** Kinds of site source documents the import endpoint understands. */
export const SiteDocumentKind = z.enum(['inventory', 'lld', 'port_mapping', 'utilization', 'fiber_test', 'sid']);
export type SiteDocumentKind = z.infer<typeof SiteDocumentKind>;

/** Provenance of one imported source file (the raw bytes are kept in object storage). */
export const SiteSourceFile = z.object({
  kind: SiteDocumentKind,
  name: z.string(),
  sha256: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().nullable(),
  importedAt: z.string(),
  importedById: z.string().nullable(),
});
export type SiteSourceFile = z.infer<typeof SiteSourceFile>;

/**
 * Manual answer for an acceptance-checklist item that photos cannot prove
 * (A/C count, temperature, floor type, ...), keyed by SID item id (V1, F1, ...).
 */
export const SurveyAnswer = z.object({
  value: z.string().trim().min(1).max(200),
  comment: z.string().trim().max(500).nullish(),
});
export type SurveyAnswer = z.infer<typeof SurveyAnswer>;

export const SurveyAnswers = z.record(z.string().regex(/^[A-Z]\d{1,2}$/), SurveyAnswer);
export type SurveyAnswers = z.infer<typeof SurveyAnswers>;

/**
 * Per-site technical data used by the acceptance report (stored as typed JSON columns in
 * `site_technical_data`, validated with this schema on every write and read; see ADR 0004).
 */
export const SiteTechnical = z.object({
  siteData: SiteData.nullable().default(null),
  inventory: InventorySchema.nullable().default(null),
  lld: LldSchema.nullable().default(null),
  portMap: z.array(PortMapRow).default([]),
  utilization: z.array(UtilizationSheet).default([]),
  fiberTests: z.array(FiberTestSheet).default([]),
  survey: SurveyAnswers.default({}),
  sources: z.array(SiteSourceFile).default([]),
});
export type SiteTechnical = z.infer<typeof SiteTechnical>;

export const EMPTY_TECHNICAL: SiteTechnical = SiteTechnical.parse({});

/** Editable site-data fields (manual corrections on top of / instead of the SID table). */
export const SiteDataPatch = SiteData.omit({ raw: true }).partial();
export type SiteDataPatch = z.infer<typeof SiteDataPatch>;

export function emptySiteData(): z.infer<typeof SiteData> {
  return {
    siteName: null, region: null, room: null, racks: null, project: null, deviceBrand: null, deviceModel: null,
    deviceSerial: null, hostname: null, loopbackIp: null, managementSource: null, installationType: null, gps: null,
    contractNumber: null, announcementDate: null, installationDate: null, contractor: null, raw: {},
  };
}

/** Parts of the technical data one upload produced; absent keys are left unchanged. */
export interface TechnicalUpdate {
  siteData?: z.infer<typeof SiteData>;
  inventory?: Inventory;
  lld?: z.infer<typeof LldSchema>;
  portMap?: z.infer<typeof PortMapRow>[];
  utilization?: z.infer<typeof UtilizationSheet>[];
  fiberTests?: z.infer<typeof FiberTestSheet>[];
  /** From a SID docx: BOM tables (stored as BOM lines, not in the technical JSON). */
  sidBom?: BomRow[];
  passivePower?: PassiveItem[];
  telcoPassive?: PassiveItem[];
}

const byKey = <T>(existing: readonly T[], incoming: readonly T[], key: (t: T) => string): T[] => {
  const map = new Map(existing.map((e) => [key(e), e]));
  for (const i of incoming) map.set(key(i), i);
  return [...map.values()];
};

/**
 * Merge an import into stored technical data. Single-file kinds replace; multi-file kinds merge
 * by natural key so ODF sheets can be uploaded one at a time (port, ODF kind+number, ODF number).
 */
export function mergeTechnical(existing: SiteTechnical, update: TechnicalUpdate): SiteTechnical {
  return {
    ...existing,
    siteData: update.siteData ?? existing.siteData,
    inventory: update.inventory ?? existing.inventory,
    lld: update.lld ?? existing.lld,
    portMap: update.portMap ? byKey(existing.portMap, update.portMap, (r) => r.port) : existing.portMap,
    utilization: update.utilization
      ? byKey(existing.utilization, update.utilization, (u) => `${u.kind}:${u.odf}`).sort((a, b) => a.odf - b.odf)
      : existing.utilization,
    fiberTests: update.fiberTests
      ? byKey(existing.fiberTests, update.fiberTests, (t) => String(t.odf ?? 'unknown')).sort((a, b) => (a.odf ?? 99) - (b.odf ?? 99))
      : existing.fiberTests,
  };
}

export interface ActiveBomLine {
  partNumber: string;
  description: string;
  qty: number;
  serials: string[];
}

/** Active BOM from `show inventory`: one line per PID (chassis first), qty = count, serials kept. */
export function bomFromInventory(inv: Inventory): ActiveBomLine[] {
  const order: Record<string, number> = { chassis: 0, route_processor: 1, line_card: 2, fabric_card: 3, fan_tray: 4, power_tray: 5, power_module: 6, transceiver: 7, other: 8 };
  const lines = new Map<string, ActiveBomLine & { rank: number }>();
  for (const e of inv.entries) {
    if (!e.pid) continue;
    const line = lines.get(e.pid) ?? { partNumber: e.pid, description: e.descr, qty: 0, serials: [], rank: order[e.kind] ?? 9 };
    line.qty += 1;
    if (e.sn) line.serials.push(e.sn);
    lines.set(e.pid, line);
  }
  return [...lines.values()].sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...l }) => l);
}
