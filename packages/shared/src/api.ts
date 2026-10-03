import { z } from 'zod';
import { BBox } from './analysis.js';
import {
  CaptureSource,
  CategoryState,
  PhotoCategory,
  PhotoStatus,
  ReviewDecision,
  Role,
  Severity,
  SnagSource,
  SnagStatus,
  Verdict,
} from './enums.js';

/**
 * HTTP API request contracts (validated by the API, reusable by web and mobile clients).
 * Responses are documented in the OpenAPI spec served by the API at /docs-json.
 */

const id = z.string().min(1).max(64);
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

// ───────────────────────────── common ─────────────────────────────

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type PageQuery = z.infer<typeof PageQuery>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Error body returned by every failing endpoint. */
export const ApiError = z.object({
  statusCode: z.number(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

// ───────────────────────────── auth & users ─────────────────────────────

export const LoginRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RefreshRequest = z.object({ refreshToken: z.string().min(20).max(512) });
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const TokenResponse = z.object({
  accessToken: z.string(),
  accessTokenExpiresIn: z.number(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
  tokenType: z.literal('Bearer'),
});
export type TokenResponse = z.infer<typeof TokenResponse>;

/** Minimum 10 characters; length beats complexity rules (NIST 800-63B). */
export const Password = z.string().min(10).max(256);

export const CreateUserRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: trimmed(120),
  password: Password,
  role: Role,
  phone: optionalText(40),
  companyId: id.optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const UpdateUserRequest = z
  .object({
    name: trimmed(120),
    role: Role,
    phone: z.string().trim().max(40).nullable(),
    companyId: id.nullable(),
    isActive: z.boolean(),
    password: Password,
  })
  .partial();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;

export const ListUsersQuery = PageQuery.extend({
  role: Role.optional(),
  q: optionalText(120),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuery>;

// ───────────────────────────── projects / sites / devices / visits ─────────────────────────────

export const CreateProjectRequest = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/),
  name: trimmed(200),
  clientName: optionalText(200),
  description: optionalText(2000),
  companyId: id.optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;
export const UpdateProjectRequest = CreateProjectRequest.omit({ code: true }).partial();
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequest>;
export const ListProjectsQuery = PageQuery.extend({
  q: optionalText(120),
  includeArchived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type ListProjectsQuery = z.infer<typeof ListProjectsQuery>;

export const Gps = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional(),
});
export type Gps = z.infer<typeof Gps>;

export const CreateSiteRequest = z.object({
  projectId: id,
  code: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._()-]+$/),
  name: trimmed(200),
  exchange: optionalText(200),
  region: optionalText(200),
  room: optionalText(200),
  floor: optionalText(60),
  racks: z.number().int().min(0).max(1000).optional(),
  gps: Gps.omit({ accuracy: true }).optional(),
});
export type CreateSiteRequest = z.infer<typeof CreateSiteRequest>;
export const UpdateSiteRequest = CreateSiteRequest.omit({ code: true, projectId: true }).partial();
export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequest>;
export const ListSitesQuery = PageQuery.extend({
  projectId: id.optional(),
  q: optionalText(120),
  includeArchived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type ListSitesQuery = z.infer<typeof ListSitesQuery>;

export const CreateDeviceRequest = z.object({
  siteId: id,
  model: trimmed(80),
  hostname: optionalText(120),
  serial: optionalText(80),
  loopbackIp: z.string().ip().optional(),
  role: optionalText(80),
});
export type CreateDeviceRequest = z.infer<typeof CreateDeviceRequest>;
export const UpdateDeviceRequest = CreateDeviceRequest.omit({ siteId: true }).partial();
export type UpdateDeviceRequest = z.infer<typeof UpdateDeviceRequest>;
export const ListDevicesQuery = PageQuery.extend({ siteId: id.optional(), q: optionalText(120) });
export type ListDevicesQuery = z.infer<typeof ListDevicesQuery>;

export const VisitStatus = z.enum(['planned', 'in_progress', 'submitted', 'closed', 'cancelled']);
export type VisitStatus = z.infer<typeof VisitStatus>;
export const VisitType = z.enum(['installation', 'snag_fix', 'survey']);
export type VisitType = z.infer<typeof VisitType>;

export const CreateVisitRequest = z.object({
  siteId: id,
  title: trimmed(200),
  type: VisitType.default('installation'),
  scheduledFor: z.coerce.date().optional(),
  notes: optionalText(4000),
  technicianIds: z.array(id).max(50).default([]),
});
export type CreateVisitRequest = z.infer<typeof CreateVisitRequest>;
export const UpdateVisitRequest = z
  .object({
    title: trimmed(200),
    type: VisitType,
    status: VisitStatus,
    scheduledFor: z.coerce.date().nullable(),
    notes: z.string().trim().max(4000).nullable(),
  })
  .partial();
export type UpdateVisitRequest = z.infer<typeof UpdateVisitRequest>;
export const ListVisitsQuery = PageQuery.extend({
  siteId: id.optional(),
  projectId: id.optional(),
  status: VisitStatus.optional(),
  technicianId: id.optional(),
});
export type ListVisitsQuery = z.infer<typeof ListVisitsQuery>;
export const AssignTechniciansRequest = z.object({ userIds: z.array(id).min(1).max(50) });
export type AssignTechniciansRequest = z.infer<typeof AssignTechniciansRequest>;

// ───────────────────────────── photos ─────────────────────────────

/**
 * Metadata sent with a photo upload (multipart field `metadata`, JSON).
 * `clientUuid` is generated on the device when the photo is captured; retries with the
 * same clientUuid return the already-stored photo (idempotent).
 */
export const UploadPhotoMetadata = z.object({
  clientUuid: z.string().uuid(),
  visitId: id,
  category: PhotoCategory,
  capturedAt: z.coerce.date().optional(),
  gps: Gps.optional(),
  deviceInfo: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  /** Set when this photo is a re-shot that fixes snags of another (rejected) photo. */
  fixesPhotoId: id.optional(),
  /** Default camera (live capture in the field app). */
  captureSource: CaptureSource.default('camera'),
  /** Groups the photos of one bulk upload session (client-generated). */
  uploadBatchId: z.string().uuid().optional(),
  /**
   * Bulk upload: `category` is only the uploader's first guess; the AI proposes one and nothing is
   * analysed until the uploader confirms (POST /photos/confirm-categories).
   */
  autoCategory: z.boolean().default(false),
  /** Original file path/name from the uploader's disk (hint for the category proposal). */
  fileName: z.string().trim().max(300).optional(),
});
export type UploadPhotoMetadata = z.infer<typeof UploadPhotoMetadata>;

/** Confirm (or correct) the categories of bulk-uploaded photos; each confirmed photo is then analysed. */
export const ConfirmCategoriesRequest = z.object({
  items: z.array(z.object({ photoId: id, category: PhotoCategory })).min(1).max(200),
});
export type ConfirmCategoriesRequest = z.infer<typeof ConfirmCategoriesRequest>;

export const ListPhotosQuery = PageQuery.extend({
  visitId: id.optional(),
  uploadBatchId: z.string().uuid().optional(),
  categoryState: CategoryState.optional(),
  siteId: id.optional(),
  projectId: id.optional(),
  category: PhotoCategory.optional(),
  status: PhotoStatus.optional(),
});
export type ListPhotosQuery = z.infer<typeof ListPhotosQuery>;

export const RejectPhotoRequest = z.object({ reason: trimmed(2000) });
export type RejectPhotoRequest = z.infer<typeof RejectPhotoRequest>;

// ───────────────────────────── review & snags ─────────────────────────────

export const ReviewQueueQuery = PageQuery.extend({
  projectId: id.optional(),
  siteId: id.optional(),
  category: PhotoCategory.optional(),
  status: PhotoStatus.default('pending_review'),
});
export type ReviewQueueQuery = z.infer<typeof ReviewQueueQuery>;

export const NewSnag = z.object({
  /** Taxonomy code from @acceptance/checklist. */
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  severity: Severity.optional(),
  bbox: BBox.optional(),
  textAr: optionalText(2000),
  textEn: optionalText(2000),
});
export type NewSnag = z.infer<typeof NewSnag>;

/**
 * A reviewer's decision on the AI result. Every submission is stored as an immutable
 * Review row (training label).
 * - agree: AI verdict and snags are right (verdict defaults to the AI verdict).
 * - override: the verdict and/or snag list is wrong; `reason` required.
 * - add_snag: AI missed snags; `addSnags` required.
 */
export const SubmitReviewRequest = z
  .object({
    decision: ReviewDecision,
    verdict: Verdict.exclude(['uncertain']).optional(),
    reason: optionalText(2000),
    addSnags: z.array(NewSnag).max(50).default([]),
    removeSnagIds: z.array(id).max(100).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'override' && !v.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'reason is required for override' });
    }
    if (v.decision === 'add_snag' && v.addSnags.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['addSnags'], message: 'add_snag needs at least one snag' });
    }
    if (v.decision === 'agree' && (v.addSnags.length > 0 || v.removeSnagIds.length > 0)) {
      ctx.addIssue({ code: 'custom', path: ['decision'], message: 'agree cannot change snags; use override or add_snag' });
    }
  });
export type SubmitReviewRequest = z.infer<typeof SubmitReviewRequest>;

export const ListSnagsQuery = PageQuery.extend({
  projectId: id.optional(),
  siteId: id.optional(),
  visitId: id.optional(),
  photoId: id.optional(),
  category: PhotoCategory.optional(),
  status: SnagStatus.optional(),
  source: SnagSource.optional(),
  code: z.string().max(80).optional(),
  includeDismissed: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type ListSnagsQuery = z.infer<typeof ListSnagsQuery>;

export const FixSnagRequest = z.object({ fixPhotoId: id, note: optionalText(2000) });
export type FixSnagRequest = z.infer<typeof FixSnagRequest>;
export const ReopenSnagRequest = z.object({ reason: trimmed(2000) });
export type ReopenSnagRequest = z.infer<typeof ReopenSnagRequest>;

export const AgreementMetricsQuery = z.object({
  projectId: id.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AgreementMetricsQuery = z.infer<typeof AgreementMetricsQuery>;

export const ListAuditLogsQuery = PageQuery.extend({
  entity: z.string().max(60).optional(),
  entityId: id.optional(),
  actorId: id.optional(),
});
export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuery>;
