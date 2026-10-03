import type { PhotoStatus } from '@acceptance/shared';
import type { QueueStatus } from '../features/queue/queue-store';
import type { Tone } from './components';

export const photoTone: Record<PhotoStatus, Tone> = {
  captured: 'muted',
  uploaded: 'info',
  ai_analyzed: 'info',
  pending_review: 'info',
  approved: 'ok',
  rejected: 'danger',
  fixed: 'warn',
};

export const queueTone: Record<QueueStatus, Tone> = {
  queued: 'muted',
  uploading: 'info',
  linking: 'info',
  done: 'ok',
  failed: 'danger',
};

/** Photos whose result may still change (poll the server while one is visible). */
export const PENDING_STATUSES: PhotoStatus[] = ['uploaded', 'ai_analyzed', 'pending_review', 'fixed'];
