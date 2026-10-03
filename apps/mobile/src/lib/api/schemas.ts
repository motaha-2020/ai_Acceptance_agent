import { z } from 'zod';
import { AppReleaseDto, PhotoCategory, PhotoStatus, Role, Severity, TokenResponse, Verdict, VisitStatus } from '@acceptance/shared';

/**
 * Response shapes the app relies on. Request contracts come from @acceptance/shared; responses are
 * validated here (only the fields the app uses, extra fields pass through) so a server change is
 * caught as a readable error instead of a crash deep in a screen.
 */
export const AuthUserDto = z.object({ id: z.string(), email: z.string(), name: z.string(), role: Role });
export type AuthUserDto = z.infer<typeof AuthUserDto>;

export const LoginResponse = TokenResponse.extend({ user: AuthUserDto });
export type LoginResponse = z.infer<typeof LoginResponse>;
export { TokenResponse };

export const VisitDto = z
  .object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    status: VisitStatus,
    scheduledFor: z.string().nullable(),
    notes: z.string().nullable(),
    site: z.object({ id: z.string(), code: z.string(), name: z.string() }).passthrough(),
    _count: z.object({ photos: z.number() }).optional(),
  })
  .passthrough();
export type VisitDto = z.infer<typeof VisitDto>;

export const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), total: z.number(), page: z.number(), pageSize: z.number() });

export const PhotoDto = z
  .object({
    id: z.string(),
    clientUuid: z.string(),
    visitId: z.string(),
    category: PhotoCategory,
    status: PhotoStatus,
    capturedAt: z.string().nullable(),
    uploadedAt: z.string(),
    fixesPhotoId: z.string().nullable(),
    rejectionReason: z.string().nullable(),
    aiSkipReason: z.string().nullable().optional(),
    urls: z.object({ thumb: z.string(), web: z.string(), original: z.string() }),
  })
  .passthrough();
export type PhotoDto = z.infer<typeof PhotoDto>;

export const SnagDto = z
  .object({
    id: z.string(),
    photoId: z.string(),
    code: z.string(),
    severity: Severity,
    textAr: z.string(),
    textEn: z.string(),
    status: z.enum(['open', 'fixed', 'verified']),
    source: z.enum(['ai', 'human']),
    dismissedAt: z.string().nullable(),
    fixPhotoId: z.string().nullable(),
    photo: z.object({ id: z.string(), status: PhotoStatus, category: PhotoCategory, visitId: z.string() }).passthrough().optional(),
  })
  .passthrough();
export type SnagDto = z.infer<typeof SnagDto>;

export const AnalysisDto = z
  .object({
    id: z.string(),
    status: z.string(),
    verdict: Verdict.nullable(),
    confidence: z.number().nullable(),
    qualityIssues: z.array(z.string()),
    createdAt: z.string(),
  })
  .passthrough();

export const ReviewDto = z
  .object({
    id: z.string(),
    decision: z.string(),
    verdict: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    createdAt: z.string(),
    reviewer: z.object({ id: z.string(), name: z.string() }).optional(),
  })
  .passthrough();

export const PhotoDetailDto = PhotoDto.extend({
  analyses: z.array(AnalysisDto),
  snags: z.array(SnagDto),
  reviews: z.array(ReviewDto),
});
export type PhotoDetailDto = z.infer<typeof PhotoDetailDto>;

export const UploadResultDto = z.object({ photo: PhotoDto, created: z.boolean(), duplicate: z.string().optional() });

export { AppReleaseDto };
