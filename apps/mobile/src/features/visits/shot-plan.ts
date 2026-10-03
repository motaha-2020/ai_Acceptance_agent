import type { CategoryChecklist } from '@acceptance/checklist';
import type { PhotoCategory, PhotoStatus } from '@acceptance/shared';
import type { QueueStatus } from '../queue/queue-store';

export interface ServerPhotoLite {
  id: string;
  clientUuid: string;
  category: PhotoCategory;
  status: PhotoStatus;
}

export interface LocalItemLite {
  clientUuid: string;
  category: PhotoCategory;
  status: QueueStatus;
}

export interface CategoryProgress {
  category: PhotoCategory;
  titleAr: string;
  titleEn: string;
  required: number;
  /** Photos that count towards the shot list (uploaded and not rejected, or still on the phone). */
  captured: number;
  approved: number;
  rejected: number;
  inReview: number;
  /** Still on the phone (queued/uploading/failed). */
  local: number;
  complete: boolean;
}

const IN_REVIEW: PhotoStatus[] = ['uploaded', 'ai_analyzed', 'pending_review', 'fixed'];

/**
 * Per-category progress for a visit, merging server photos with photos still in the offline queue
 * (a queued item that the server already has is counted once, by clientUuid).
 */
export function buildShotPlan(checklists: readonly CategoryChecklist[], server: ServerPhotoLite[], local: LocalItemLite[]): CategoryProgress[] {
  const onServer = new Set(server.map((p) => p.clientUuid));
  return checklists.map((c) => {
    const photos = server.filter((p) => p.category === c.category);
    const pending = local.filter((l) => l.category === c.category && l.status !== 'done' && !onServer.has(l.clientUuid));
    const approved = photos.filter((p) => p.status === 'approved').length;
    const rejected = photos.filter((p) => p.status === 'rejected').length;
    const inReview = photos.filter((p) => IN_REVIEW.includes(p.status)).length;
    const captured = approved + inReview + pending.length;
    const required = c.requiredShots.length;
    return {
      category: c.category,
      titleAr: c.titleAr,
      titleEn: c.titleEn,
      required,
      captured,
      approved,
      rejected,
      inReview,
      local: pending.length,
      complete: captured >= required && rejected === 0,
    };
  });
}

export function visitCompletion(plan: CategoryProgress[]): { done: number; total: number } {
  return { done: plan.filter((p) => p.complete).length, total: plan.length };
}
