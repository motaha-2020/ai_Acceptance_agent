import { z } from 'zod';

/** Report lifecycle (mirrors the Prisma ReportStatus enum). */
export const ReportStatus = z.enum(['queued', 'running', 'ready', 'failed']);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** POST /sites/:id/reports. A final report is refused while open snags or unreviewed photos exist. */
export const CreateReportRequest = z.object({ draft: z.boolean().default(false) }).strict();
export type CreateReportRequest = z.infer<typeof CreateReportRequest>;

export const ReportFormat = z.enum(['docx', 'pdf']);
export type ReportFormat = z.infer<typeof ReportFormat>;

export const ReportDownloadQuery = z.object({ format: ReportFormat.default('docx') });
export type ReportDownloadQuery = z.infer<typeof ReportDownloadQuery>;

export interface ReportChecklistTotals {
  pass: number;
  fail: number;
  pending: number;
  manual: number;
  na: number;
}

export interface ReportDto {
  id: string;
  siteId: string;
  version: number;
  status: ReportStatus;
  draft: boolean;
  hasDocx: boolean;
  hasPdf: boolean;
  docxBytes: number | null;
  pdfBytes: number | null;
  warnings: string[];
  error: string | null;
  meta: { checklist?: ReportChecklistTotals; galleryPhotos?: number; bomSource?: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ReportDownloadDto {
  url: string;
  fileName: string;
  expiresAt: string;
}

/** Why a final report is blocked (409 REPORT_BLOCKED details). */
export interface ReportBlockers {
  openSnags: number;
  unverifiedFixes: number;
  unreviewedPhotos: number;
}

export const SiteDocumentKind = z.enum(['inventory', 'lld', 'port_mapping', 'utilization', 'fiber_test', 'sid']);
export type SiteDocumentKind = z.infer<typeof SiteDocumentKind>;

/** Manual corrections of the SID site-data fields and answers to non-photo checklist items. */
export const UpdateSiteDocumentsRequest = z
  .object({
    siteData: z
      .object({
        siteName: z.string().max(200).nullable(),
        region: z.string().max(200).nullable(),
        room: z.string().max(200).nullable(),
        racks: z.string().max(50).nullable(),
        project: z.string().max(200).nullable(),
        deviceBrand: z.string().max(100).nullable(),
        deviceModel: z.string().max(100).nullable(),
        deviceSerial: z.string().max(100).nullable(),
        hostname: z.string().max(100).nullable(),
        loopbackIp: z.string().max(100).nullable(),
        managementSource: z.string().max(200).nullable(),
        installationType: z.string().max(100).nullable(),
        gps: z.string().max(100).nullable(),
        contractNumber: z.string().max(100).nullable(),
        announcementDate: z.string().max(50).nullable(),
        installationDate: z.string().max(50).nullable(),
        contractor: z.string().max(200).nullable(),
      })
      .partial()
      .strict()
      .optional(),
    /** Keyed by SID checklist item id (V1, F1, ...); null removes an answer. */
    survey: z
      .record(z.string().regex(/^[A-Z]\d{1,2}$/), z.object({ value: z.string().trim().min(1).max(200), comment: z.string().trim().max(500).nullish() }).nullable())
      .optional(),
  })
  .strict();
export type UpdateSiteDocumentsRequest = z.infer<typeof UpdateSiteDocumentsRequest>;

export interface SiteDocumentsDto {
  siteId: string;
  /** Which parts are present, with a short count. */
  parts: { siteData: boolean; inventory: number; lld: number; portMap: number; utilization: number; fiberTests: number; survey: number; bomLines: number };
  sources: { kind: SiteDocumentKind; name: string; sizeBytes: number; importedAt: string }[];
  warnings: string[];
  updatedAt: string | null;
}

export interface ImportSiteDocumentsResult extends SiteDocumentsDto {
  imported: { name: string; kind: SiteDocumentKind; summary: string }[];
  failed: { name: string; error: string }[];
}
