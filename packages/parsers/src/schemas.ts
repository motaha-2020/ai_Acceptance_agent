import { z } from 'zod';

// ───────────── device inventory (Cisco `show inventory`) ─────────────

export const InventoryKind = z.enum([
  'chassis', 'route_processor', 'line_card', 'fabric_card', 'fan_tray', 'power_tray',
  'power_module', 'transceiver', 'other',
]);
export type InventoryKind = z.infer<typeof InventoryKind>;

export const InventoryEntry = z.object({
  name: z.string(),
  descr: z.string(),
  pid: z.string(),
  vid: z.string().nullable(),
  sn: z.string(),
  kind: InventoryKind,
  /** "0/1" for transceivers/line cards, null when not slot-bound */
  slot: z.string().nullable(),
});
export type InventoryEntry = z.infer<typeof InventoryEntry>;

export const InventorySchema = z.object({
  hostname: z.string(),
  capturedAt: z.string().nullable(),
  entries: z.array(InventoryEntry).min(1),
});
export type Inventory = z.infer<typeof InventorySchema>;

// ───────────── ODF mapping / utilization ─────────────

export const FiberRef = z.object({
  odf: z.number().int().positive(),
  panel: z.string().regex(/^[A-Z]$/),
  fibers: z.array(z.number().int().positive()).min(1),
});
export type FiberRef = z.infer<typeof FiberRef>;

export const PortMapRow = z.object({
  port: z.string(),
  cc: FiberRef.nullable(),
  tie: FiberRef.nullable(),
  uplink: z.object({ peerDevice: z.string(), peerPort: z.string() }).nullable(),
});
export type PortMapRow = z.infer<typeof PortMapRow>;

export const UtilizationEntry = z.object({
  panel: z.string().regex(/^[A-Z]$/),
  fiber: z.number().int().positive(),
  port: z.string().nullable(),
});

export const UtilizationSheet = z.object({
  title: z.string(),
  odf: z.number().int().positive(),
  kind: z.enum(['CC', 'TIE']),
  entries: z.array(UtilizationEntry),
});
export type UtilizationSheet = z.infer<typeof UtilizationSheet>;

// ───────────── fiber tests ─────────────

export const FiberMeasurement = z.object({
  panel: z.string().regex(/^[A-Z]$/),
  fibers: z.array(z.number().int().positive()).min(1),
  direction: z.enum(['TX', 'RX']).nullable(),
  lossDb: z.number(),
});
export type FiberMeasurement = z.infer<typeof FiberMeasurement>;

export const FiberTestSheet = z.object({
  odf: z.number().int().positive().nullable(),
  layout: z.enum(['panel_by_fiber', 'fiberpair_by_panel']),
  measurements: z.array(FiberMeasurement).min(1),
  summary: z.object({ count: z.number(), minDb: z.number(), maxDb: z.number(), meanDb: z.number() }),
});
export type FiberTestSheet = z.infer<typeof FiberTestSheet>;

// ───────────── LLD ─────────────

export const LldInstallRow = z.object({
  hostname: z.string(),
  routerFunction: z.string(),
  node: z.string().nullable(),
  type: z.string().nullable(),
  project: z.string().nullable(),
});

export const LldLink = z.object({
  parentRouter: z.string(),
  parentInterface: z.string(),
  childRouter: z.string(),
  childInterface: z.string(),
  cost: z.number().nullable(),
});
export type LldLink = z.infer<typeof LldLink>;

export const LldSchema = z.object({
  title: z.string().nullable(),
  site: z.string().nullable(),
  author: z.string().nullable(),
  date: z.string().nullable(),
  install: z.array(LldInstallRow),
  internalLinks: z.array(LldLink),
});
export type Lld = z.infer<typeof LldSchema>;

// ───────────── SID site data / BOM ─────────────

export const SiteData = z.object({
  siteName: z.string().nullable(),
  region: z.string().nullable(),
  room: z.string().nullable(),
  racks: z.string().nullable(),
  project: z.string().nullable(),
  deviceBrand: z.string().nullable(),
  deviceModel: z.string().nullable(),
  deviceSerial: z.string().nullable(),
  hostname: z.string().nullable(),
  loopbackIp: z.string().nullable(),
  managementSource: z.string().nullable(),
  installationType: z.string().nullable(),
  gps: z.string().nullable(),
  contractNumber: z.string().nullable(),
  announcementDate: z.string().nullable(),
  installationDate: z.string().nullable(),
  contractor: z.string().nullable(),
  /** every label/value pair exactly as written in the SID table */
  raw: z.record(z.string()),
});
export type SiteData = z.infer<typeof SiteData>;

export const BomRow = z.object({
  seq: z.number().int(),
  partNumber: z.string(),
  qty: z.number().int(),
  serials: z.array(z.string()),
});
export type BomRow = z.infer<typeof BomRow>;

export const PassiveItem = z.object({
  description: z.string(),
  unit: z.string().nullable(),
  qty: z.number().nullable(),
});
export type PassiveItem = z.infer<typeof PassiveItem>;

/** Full site seed assembled from one site's source files (tools/ingest T1.3 output). */
export const SiteSeed = z.object({
  siteId: z.string(),
  sourceFolder: z.string(),
  siteData: SiteData,
  device: z.object({
    hostname: z.string(),
    platform: z.string().nullable(),
    chassisSerial: z.string().nullable(),
    modules: z.array(InventoryEntry),
    transceivers: z.array(InventoryEntry),
  }),
  inventorySummary: z.record(z.number()),
  lld: LldSchema,
  portMap: z.array(PortMapRow),
  utilization: z.array(UtilizationSheet),
  fiberTests: z.array(FiberTestSheet),
  sidBom: z.array(BomRow),
  passivePower: z.array(PassiveItem),
  telcoPassive: z.array(PassiveItem),
  warnings: z.array(z.string()),
});
export type SiteSeed = z.infer<typeof SiteSeed>;
