import type { z } from 'zod';
import type {
  CreateDeviceRequest,
  CreateProjectRequest,
  CreateSiteRequest,
  CreateUserRequest,
  ConfirmCategoriesRequest,
  CreateVisitRequest,
  FixSnagRequest,
  ListDevicesQuery,
  ListPhotosQuery,
  ListProjectsQuery,
  ListSitesQuery,
  ListSnagsQuery,
  ListUsersQuery,
  ListVisitsQuery,
  Paginated,
  ReviewQueueQuery,
  SubmitReviewRequest,
  UpdateDeviceRequest,
  UpdateProjectRequest,
  UpdateSiteRequest,
  UpdateUserRequest,
  UploadPhotoMetadata,
} from '@acceptance/shared';
import { ApiRequestError, apiFetch, apiUpload } from './client';
import type {
  AgreementMetricsDto,
  AppReleaseDto,
  DeviceDto,
  Me,
  PhotoDetail,
  PhotoDto,
  ProjectDto,
  QueueItem,
  SiteDto,
  SnagDto,
  SnagListItem,
  SubmitReviewResponse,
  UserDto,
  VisitDto,
} from './types';

/** Query inputs use the zod *input* types (what callers send), request bodies the parsed types. */
type In<T extends z.ZodTypeAny> = z.input<T>;

// ───────────── auth / users ─────────────
export const getMe = (): Promise<Me> => apiFetch('/auth/me');
export const listUsers = (q: In<typeof ListUsersQuery> = {}): Promise<Paginated<UserDto>> => apiFetch('/users', { query: q });
export const createUser = (body: CreateUserRequest): Promise<UserDto> => apiFetch('/users', { method: 'POST', body });
export const updateUser = (id: string, body: UpdateUserRequest): Promise<UserDto> => apiFetch(`/users/${id}`, { method: 'PATCH', body });
export const deactivateUser = (id: string): Promise<UserDto> => apiFetch(`/users/${id}/deactivate`, { method: 'POST' });

// ───────────── catalog ─────────────
export const listProjects = (q: In<typeof ListProjectsQuery> = {}): Promise<Paginated<ProjectDto>> => apiFetch('/projects', { query: q });
export const createProject = (body: CreateProjectRequest): Promise<ProjectDto> => apiFetch('/projects', { method: 'POST', body });
export const updateProject = (id: string, body: UpdateProjectRequest): Promise<ProjectDto> => apiFetch(`/projects/${id}`, { method: 'PATCH', body });
export const archiveProject = (id: string): Promise<void> => apiFetch(`/projects/${id}`, { method: 'DELETE' });

export const listSites = (q: In<typeof ListSitesQuery> = {}): Promise<Paginated<SiteDto>> => apiFetch('/sites', { query: q });
export const getSite = (id: string): Promise<SiteDto> => apiFetch(`/sites/${id}`);
export const createSite = (body: CreateSiteRequest): Promise<SiteDto> => apiFetch('/sites', { method: 'POST', body });
export const updateSite = (id: string, body: UpdateSiteRequest): Promise<SiteDto> => apiFetch(`/sites/${id}`, { method: 'PATCH', body });
export const archiveSite = (id: string): Promise<void> => apiFetch(`/sites/${id}`, { method: 'DELETE' });

export const listDevices = (q: In<typeof ListDevicesQuery> = {}): Promise<Paginated<DeviceDto>> => apiFetch('/devices', { query: q });
export const createDevice = (body: CreateDeviceRequest): Promise<DeviceDto> => apiFetch('/devices', { method: 'POST', body });
export const updateDevice = (id: string, body: UpdateDeviceRequest): Promise<DeviceDto> => apiFetch(`/devices/${id}`, { method: 'PATCH', body });
export const deleteDevice = (id: string): Promise<void> => apiFetch(`/devices/${id}`, { method: 'DELETE' });

export const listVisits = (q: In<typeof ListVisitsQuery> = {}): Promise<Paginated<VisitDto>> => apiFetch('/visits', { query: q });
export const createVisit = (body: z.input<typeof CreateVisitRequest>): Promise<VisitDto> => apiFetch('/visits', { method: 'POST', body });
export const assignTechnicians = (visitId: string, userIds: string[]): Promise<VisitDto> =>
  apiFetch(`/visits/${visitId}/assignments`, { method: 'POST', body: { userIds } });
export const unassignTechnician = (visitId: string, userId: string): Promise<VisitDto> =>
  apiFetch(`/visits/${visitId}/assignments/${userId}`, { method: 'DELETE' });

// ───────────── photos & review ─────────────
export const listPhotos = (q: In<typeof ListPhotosQuery> = {}): Promise<Paginated<PhotoDto>> => apiFetch('/photos', { query: q });

/** One photo (multipart). Idempotent per metadata.clientUuid, so a retry after a network error is safe. */
export function uploadPhoto(file: Blob, metadata: z.input<typeof UploadPhotoMetadata>, signal?: AbortSignal): Promise<{ photo: PhotoDto; created: boolean; duplicate?: 'client_uuid' | 'content' }> {
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set('file', file);
  return apiUpload('/photos', form, signal);
}
export const confirmCategories = (items: ConfirmCategoriesRequest['items']): Promise<{ confirmed: number; skipped: number }> =>
  apiFetch('/photos/confirm-categories', { method: 'POST', body: { items } });
export const getPhoto = (id: string): Promise<PhotoDetail> => apiFetch(`/photos/${id}`);

export const getReviewQueue = (q: In<typeof ReviewQueueQuery> = {}): Promise<Paginated<QueueItem>> => apiFetch('/reviews/queue', { query: q });
export const submitReview = (photoId: string, body: z.input<typeof SubmitReviewRequest>): Promise<SubmitReviewResponse> =>
  apiFetch(`/photos/${photoId}/reviews`, { method: 'POST', body });
export const approvePhoto = (photoId: string): Promise<PhotoDto> => apiFetch(`/photos/${photoId}/approve`, { method: 'POST' });
export const rejectPhoto = (photoId: string, reason: string): Promise<PhotoDto> =>
  apiFetch(`/photos/${photoId}/reject`, { method: 'POST', body: { reason } });

// ───────────── snags ─────────────
export const listSnags = (q: In<typeof ListSnagsQuery> = {}): Promise<Paginated<SnagListItem>> => apiFetch('/snags', { query: q });
export const fixSnag = (id: string, body: FixSnagRequest): Promise<SnagDto> => apiFetch(`/snags/${id}/fix`, { method: 'POST', body });
export const verifySnag = (id: string): Promise<SnagDto> => apiFetch(`/snags/${id}/verify`, { method: 'POST' });
export const reopenSnag = (id: string, reason: string): Promise<SnagDto> => apiFetch(`/snags/${id}/reopen`, { method: 'POST', body: { reason } });

// ───────────── metrics ─────────────
export const getAgreementMetrics = (q: { projectId?: string; from?: string; to?: string } = {}): Promise<AgreementMetricsDto> =>
  apiFetch('/metrics/agreement', { query: q });

// ───────────── MISSING API ENDPOINTS (typed here so the UI is ready; see report) ─────────────

/**
 * MISSING: GET /app-releases/latest. The AppRelease table and RBAC subject exist but the API
 * exposes no endpoint yet (planned with T5.6). Returns null when the endpoint is absent so the
 * /app page shows "coming soon".
 */
export async function getLatestAppRelease(): Promise<AppReleaseDto | null> {
  try {
    return await apiFetch<AppReleaseDto | null>('/app-releases/latest');
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) return null;
    throw err;
  }
}
