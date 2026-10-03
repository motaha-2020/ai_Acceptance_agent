import { z } from 'zod';
import { FiberTestSheet, InventorySchema, LldSchema, PassiveItem, PortMapRow, SiteData, SurveyAnswers, UtilizationSheet } from '@acceptance/parsers';
import { PhotoCategory, PhotoStatus, SnagStatus } from '@acceptance/shared';

const Bytes = z.custom<Uint8Array>((v) => v instanceof Uint8Array, 'expected Uint8Array');

export const ActiveBomRow = z.object({
  partNumber: z.string().min(1),
  qty: z.number().int().nonnegative(),
  serials: z.array(z.string()),
});
export type ActiveBomRow = z.infer<typeof ActiveBomRow>;

/** One approved photo for the gallery (already resized/compressed by the caller). */
export const GalleryPhoto = z.object({
  id: z.string(),
  category: PhotoCategory,
  image: Bytes,
  mime: z.enum(['jpg', 'png']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  device: z.string().nullable(),
  capturedAt: z.string().nullable(),
});
export type GalleryPhoto = z.infer<typeof GalleryPhoto>;

export const PhotoStat = z.object({ category: PhotoCategory, status: PhotoStatus, count: z.number().int().nonnegative() });
export type PhotoStat = z.infer<typeof PhotoStat>;

/** Non-dismissed snags of the site (dismissed AI false positives are not snags). */
export const SnagFact = z.object({ code: z.string(), category: PhotoCategory, status: SnagStatus });
export type SnagFact = z.infer<typeof SnagFact>;

export const AiModelStat = z.object({
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  analyses: z.number().int().nonnegative(),
});

export const Person = z.object({ name: z.string(), role: z.string() });

/**
 * Everything the generator needs. Built by the worker from the DB; the generator itself is pure
 * (no I/O), so it is unit-testable and deterministic for a given input.
 */
export const ReportData = z.object({
  meta: z.object({
    reportId: z.string().nullable().default(null),
    version: z.number().int().positive(),
    draft: z.boolean(),
    generatedAt: z.string(),
    generatedBy: Person,
  }),
  project: z.object({ code: z.string(), name: z.string(), clientName: z.string().nullable() }),
  site: z.object({
    code: z.string(),
    name: z.string(),
    exchange: z.string().nullable(),
    /** Optional Arabic name shown in the page header (the SID header shows the exchange in Arabic). */
    nameAr: z.string().nullable().default(null),
  }),
  siteData: SiteData,
  inventory: InventorySchema.nullable(),
  lld: LldSchema.nullable(),
  bom: z.object({
    active: z.array(ActiveBomRow),
    activeSource: z.enum(['sid', 'inventory', 'none']),
    passivePower: z.array(PassiveItem),
    telcoPassive: z.array(PassiveItem),
  }),
  portMap: z.array(PortMapRow),
  utilization: z.array(UtilizationSheet),
  fiberTests: z.array(FiberTestSheet),
  survey: SurveyAnswers,
  photoStats: z.array(PhotoStat),
  snags: z.array(SnagFact),
  gallery: z.array(GalleryPhoto),
  ai: z.object({
    models: z.array(AiModelStat),
    reviews: z.number().int().nonnegative(),
    /** Share of reviews where the human verdict matched the AI verdict (null when no reviews). */
    agreementRate: z.number().min(0).max(1).nullable(),
  }),
  reviewers: z.array(Person),
  warnings: z.array(z.string()),
});
export type ReportData = z.infer<typeof ReportData>;
export type ReportDataInput = z.input<typeof ReportData>;
