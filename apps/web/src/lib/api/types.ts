import type { z } from 'zod';
import type {
  BBox,
  PhotoCategory,
  PhotoStatus,
  Role,
  Severity,
  SnagSource,
  SnagStatus,
  Verdict,
  VisitStatus,
  VisitType,
} from '@acceptance/shared';

/**
 * Response DTOs of the API (JSON over the wire: dates are ISO strings). Request bodies/queries
 * come from the zod contracts in @acceptance/shared; the API's OpenAPI document (/docs) is the
 * reference for these shapes.
 */
export type { Paginated } from '@acceptance/shared';

export type BBoxDto = z.infer<typeof BBox>;
export type SeverityDto = z.infer<typeof Severity>;
export type SnagStatusDto = z.infer<typeof SnagStatus>;
export type SnagSourceDto = z.infer<typeof SnagSource>;
export type VerdictDto = z.infer<typeof Verdict>;
export type PhotoCategoryDto = z.infer<typeof PhotoCategory>;
export type PhotoStatusDto = z.infer<typeof PhotoStatus>;
export type RoleDto = z.infer<typeof Role>;
export type VisitStatusDto = z.infer<typeof VisitStatus>;
export type VisitTypeDto = z.infer<typeof VisitType>;

export interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  companyId: string | null;
  role: RoleDto;
}

export type UserDto = Me;

export interface ProjectDto {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  description: string | null;
  companyId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { sites: number };
}

export interface DeviceDto {
  id: string;
  siteId: string;
  model: string;
  hostname: string | null;
  serial: string | null;
  loopbackIp: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; code: string; name: string };
}

export interface SiteDto {
  id: string;
  projectId: string;
  code: string;
  name: string;
  exchange: string | null;
  region: string | null;
  room: string | null;
  floor: string | null;
  racks: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; code: string; name: string };
  devices?: DeviceDto[];
  _count?: { visits: number; photos: number };
}

export interface VisitDto {
  id: string;
  siteId: string;
  title: string;
  type: VisitTypeDto;
  status: VisitStatusDto;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; code: string; name: string; projectId: string };
  assignments?: Array<{ assignedAt: string; user: { id: string; name: string; email: string } }>;
  _count?: { photos: number };
}

export interface PhotoUrls {
  thumb: string;
  web: string;
  original: string;
  expiresAt: string;
}

export interface PhotoDto {
  id: string;
  clientUuid: string;
  visitId: string;
  siteId: string;
  category: PhotoCategoryDto;
  status: PhotoStatusDto;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  duplicateOfId: string | null;
  fixesPhotoId: string | null;
  aiSkipReason: string | null;
  uploadedById: string;
  uploadedAt: string;
  decidedById: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  updatedAt: string;
  gps: { lat: number; lng: number; accuracy: number | null } | null;
  urls: PhotoUrls;
}

export interface SnagDto {
  id: string;
  photoId: string;
  analysisId: string | null;
  code: string;
  severity: SeverityDto;
  bbox: BBoxDto | null;
  textAr: string;
  textEn: string;
  status: SnagStatusDto;
  source: SnagSourceDto;
  createdById: string | null;
  dismissedAt: string | null;
  fixPhotoId: string | null;
  fixedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SnagListItem extends SnagDto {
  photo: { id: string; status: PhotoStatusDto; category: PhotoCategoryDto; siteId: string; visitId: string };
}

export interface AnalysisDto {
  id: string;
  photoId: string;
  status: 'succeeded' | 'failed' | string;
  provider: string;
  model: string;
  promptVersion: string;
  verdict: VerdictDto | null;
  confidence: number | null;
  categoryMatches: boolean | null;
  detectedCategory: PhotoCategoryDto | null;
  qualityIssues: string[];
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

/** Row of GET /reviews/queue. */
export interface QueueItem extends PhotoDto {
  site: { id: string; code: string; name: string; projectId: string };
  visit: { id: string; title: string };
  analysis: AnalysisDto | null;
  snags: SnagDto[];
}

export interface ReviewDto {
  id: string;
  photoId: string;
  reviewerId: string;
  decision: 'agree' | 'override' | 'add_snag';
  verdict: 'accept' | 'reject';
  aiVerdict: VerdictDto | null;
  reason: string | null;
  createdAt: string;
}

/** GET /photos/:id */
export interface PhotoDetail extends PhotoDto {
  exif: Record<string, unknown> | null;
  deviceInfo: Record<string, string | number | boolean> | null;
  analyses: AnalysisDto[];
  snags: SnagDto[];
  reviews: ReviewDto[];
}

export interface SubmitReviewResponse {
  review: ReviewDto;
  addedSnags: SnagDto[];
  dismissedSnagIds: string[];
}

export interface AutonomyPolicyDto {
  enabled: boolean;
  minSamples: number;
  minAgreement: number;
  minConfidence: number;
}

export interface CategoryAgreementDto {
  category: PhotoCategoryDto;
  reviewed: number;
  withAi: number;
  agree: number;
  override: number;
  addSnag: number;
  verdictMatch: number;
  agreementRate: number | null;
  verdictAccuracy: number | null;
  aiSnags: number;
  aiSnagsDismissed: number;
  humanSnags: number;
  snagPrecision: number | null;
  snagRecall: number | null;
  policy: AutonomyPolicyDto | null;
  meetsThreshold: boolean;
}

export interface AgreementMetricsDto {
  from: string | null;
  to: string | null;
  totals: {
    reviewed: number;
    withAi: number;
    agree: number;
    override: number;
    addSnag: number;
    agreementRate: number | null;
    verdictAccuracy: number | null;
  };
  categories: CategoryAgreementDto[];
}

/** Not provided by the API yet (AppRelease table exists, no endpoint). See endpoints.getLatestAppRelease. */
export interface AppReleaseDto {
  version: string;
  channel: string;
  changelog: string | null;
  downloadUrl: string | null;
  sizeBytes: number | null;
  minSupportedVersion: string | null;
  publishedAt: string;
}
