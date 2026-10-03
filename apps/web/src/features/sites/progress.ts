import { listPhotos } from '@/lib/api/endpoints';
import type { PhotoCategoryDto, PhotoDto, PhotoStatusDto } from '@/lib/api/types';

export interface CategoryProgress {
  category: PhotoCategoryDto;
  approved: number;
  pending: number;
  rejected: number;
  total: number;
}

export interface SiteProgress {
  rows: CategoryProgress[];
  approved: number;
  pending: number;
  rejected: number;
  total: number;
}

const PENDING: ReadonlySet<PhotoStatusDto> = new Set(['captured', 'uploaded', 'ai_analyzed', 'pending_review', 'fixed']);

/** approved / pending (anything awaiting AI, review or re-review) / rejected, per category. */
export function computeProgress(photos: ReadonlyArray<Pick<PhotoDto, 'category' | 'status'>>): SiteProgress {
  const by = new Map<PhotoCategoryDto, CategoryProgress>();
  const totals = { approved: 0, pending: 0, rejected: 0, total: 0 };
  for (const p of photos) {
    let row = by.get(p.category);
    if (!row) {
      row = { category: p.category, approved: 0, pending: 0, rejected: 0, total: 0 };
      by.set(p.category, row);
    }
    row.total++;
    totals.total++;
    if (p.status === 'approved') {
      row.approved++;
      totals.approved++;
    } else if (p.status === 'rejected') {
      row.rejected++;
      totals.rejected++;
    } else if (PENDING.has(p.status)) {
      row.pending++;
      totals.pending++;
    }
  }
  return { rows: [...by.values()].sort((a, b) => b.total - a.total), ...totals };
}

const MAX_PAGES = 10;

/**
 * MISSING API: there is no per-site progress/aggregate endpoint yet, so the client pages through
 * GET /photos?siteId (200 per page, at most 2000 photos) and aggregates. Replace with a
 * server-side aggregate when it exists.
 */
export async function fetchSiteProgress(siteId: string): Promise<SiteProgress> {
  const all: PhotoDto[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await listPhotos({ siteId, page, pageSize: 200 });
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return computeProgress(all);
}
