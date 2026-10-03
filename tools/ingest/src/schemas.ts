import { z } from 'zod';
import { PhotoCategory } from '@acceptance/shared';

// ---------- T1.1 snag seed ----------
export const SnagSeedRecord = z.object({
  id: z.string(),
  sourceDoc: z.string(),
  /** running position of this record in document order (1-based) */
  order: z.number().int().positive(),
  /** 1-based image number within the doc; null for text-only groups */
  imageNo: z.number().int().positive().nullable(),
  /** relative to data/ */
  imagePath: z.string().nullable(),
  remarkAr: z.string().nullable(),
  remarkIndex: z.number().int().positive(),
  remarksInGroup: z.number().int().positive(),
  groupId: z.string(),
  imagesInGroup: z.number().int().nonnegative(),
});

// ---------- T1.3 site seed ----------
export const InventoryKind = z.enum([
  'chassis', 'route_processor', 'line_card', 'fabric_card', 'fan_tray', 'power_tray',
  'power_module', 'transceiver', 'other',
]);

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

export const InventorySchema = z.object({
  hostname: z.string(),
  capturedAt: z.string().nullable(),
  entries: z.array(InventoryEntry).min(1),
});

export const FiberRef = z.object({
  odf: z.number().int().positive(),
  panel: z.string().regex(/^[A-Z]$/),
  fibers: z.array(z.number().int().positive()).min(1),
});

export const PortMapRow = z.object({
  port: z.string(),
  cc: FiberRef.nullable(),
  tie: FiberRef.nullable(),
  uplink: z.object({ peerDevice: z.string(), peerPort: z.string() }).nullable(),
});

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

export const FiberMeasurement = z.object({
  panel: z.string().regex(/^[A-Z]$/),
  fibers: z.array(z.number().int().positive()).min(1),
  direction: z.enum(['TX', 'RX']).nullable(),
  lossDb: z.number(),
});

export const FiberTestSheet = z.object({
  odf: z.number().int().positive().nullable(),
  layout: z.enum(['panel_by_fiber', 'fiberpair_by_panel']),
  measurements: z.array(FiberMeasurement).min(1),
  summary: z.object({ count: z.number(), minDb: z.number(), maxDb: z.number(), meanDb: z.number() }),
});

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

export const LldSchema = z.object({
  title: z.string().nullable(),
  site: z.string().nullable(),
  author: z.string().nullable(),
  date: z.string().nullable(),
  install: z.array(LldInstallRow),
  internalLinks: z.array(LldLink),
});

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

export const BomRow = z.object({
  seq: z.number().int(),
  partNumber: z.string(),
  qty: z.number().int(),
  serials: z.array(z.string()),
});

export const PassiveItem = z.object({
  description: z.string(),
  unit: z.string().nullable(),
  qty: z.number().nullable(),
});

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

// ---------- T1.4 photo catalogue ----------
export const PhotoCatalogRecord = z.object({
  site: z.string(),
  device: z.string(),
  category: PhotoCategory,
  /** relative to the raw data root (posix) */
  relPath: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
});
export type PhotoCatalogRecord = z.infer<typeof PhotoCatalogRecord>;
