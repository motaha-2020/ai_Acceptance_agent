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

// ---------- T1.3 site seed (schemas live in @acceptance/parsers) ----------
export {
  InventoryKind, InventoryEntry, InventorySchema, FiberRef, PortMapRow, UtilizationEntry, UtilizationSheet,
  FiberMeasurement, FiberTestSheet, LldInstallRow, LldLink, LldSchema, SiteData, BomRow, PassiveItem, SiteSeed,
} from '@acceptance/parsers';

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
