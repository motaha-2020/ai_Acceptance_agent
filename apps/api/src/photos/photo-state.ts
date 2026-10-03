import type { PhotoStatus } from '@acceptance/shared';
import { invalidTransition } from '../core/errors.js';

/**
 * Photo lifecycle:
 *   captured -> uploaded -> ai_analyzed -> pending_review -> approved | rejected
 *   rejected -> fixed (all snags fixed by re-shots) -> approved (snags verified) | rejected (fix refused)
 * `uploaded -> pending_review` happens when AI is skipped (budget) or failed;
 * `pending_review -> uploaded` is a manual re-analysis; `ai_analyzed -> approved` is the Phase 2 autonomy gate.
 */
export const PHOTO_TRANSITIONS: Readonly<Record<PhotoStatus, readonly PhotoStatus[]>> = {
  captured: ['uploaded'],
  uploaded: ['ai_analyzed', 'pending_review'],
  ai_analyzed: ['pending_review', 'approved'],
  pending_review: ['approved', 'rejected', 'uploaded'],
  approved: [],
  rejected: ['fixed'],
  fixed: ['approved', 'rejected'],
};

export function canTransitionPhoto(from: PhotoStatus, to: PhotoStatus): boolean {
  return PHOTO_TRANSITIONS[from].includes(to);
}

export function assertPhotoTransition(from: PhotoStatus, to: PhotoStatus): void {
  if (!canTransitionPhoto(from, to)) throw invalidTransition('Photo', from, to);
}

/** Statuses in which a reviewer can record a decision. */
export const REVIEWABLE: readonly PhotoStatus[] = ['pending_review', 'fixed'];
