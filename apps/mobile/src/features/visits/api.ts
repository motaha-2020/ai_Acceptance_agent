import type { VisitStatus } from '@acceptance/shared';
import type { ApiClient } from '../../lib/api/client';
import { page, PhotoDetailDto, PhotoDto, SnagDto, VisitDto } from '../../lib/api/schemas';

/** Thin typed wrappers over the API endpoints the field app uses. */
export const visitsApi = {
  list: (api: ApiClient) => api.json(page(VisitDto), '/visits', { query: { pageSize: 100 } }),
  get: (api: ApiClient, id: string) => api.json(VisitDto, `/visits/${encodeURIComponent(id)}`),
  setStatus: (api: ApiClient, id: string, status: Extract<VisitStatus, 'in_progress' | 'submitted'>) =>
    api.json(VisitDto, `/visits/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } }),
  photos: (api: ApiClient, visitId: string) => api.json(page(PhotoDto), '/photos', { query: { visitId, pageSize: 200 } }),
  photo: (api: ApiClient, id: string) => api.json(PhotoDetailDto, `/photos/${encodeURIComponent(id)}`),
  snags: (api: ApiClient, visitId: string, status?: 'open' | 'fixed' | 'verified') =>
    api.json(page(SnagDto), '/snags', { query: { visitId, status, pageSize: 200 } }),
};
