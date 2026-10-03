import { invalidTransition } from '../core/errors.js';

export type SnagStatus = 'open' | 'fixed' | 'verified';
export type SnagEvent = 'fix' | 'verify' | 'reopen';

/**
 * Snag lifecycle: open --fix(new photo)--> fixed --verify--> verified
 *                                          fixed --reopen--> open
 * Dismissal (AI false positive removed by a reviewer) is orthogonal: only open snags can be
 * dismissed and a dismissed snag takes no further events.
 */
const SNAG_TRANSITIONS: Readonly<Record<SnagStatus, Partial<Record<SnagEvent, SnagStatus>>>> = {
  open: { fix: 'fixed' },
  fixed: { verify: 'verified', reopen: 'open' },
  verified: {},
};

export function nextSnagStatus(current: SnagStatus, event: SnagEvent, dismissed = false): SnagStatus {
  const next = dismissed ? undefined : SNAG_TRANSITIONS[current][event];
  if (!next) throw invalidTransition('Snag', dismissed ? `${current} (dismissed)` : current, event);
  return next;
}

export function canDismiss(status: SnagStatus, dismissed: boolean): boolean {
  return status === 'open' && !dismissed;
}

export interface SnagLike {
  status: SnagStatus;
  dismissedAt: Date | null;
}

/** Snags that still count (not dismissed as false positives). */
export const activeSnags = <T extends SnagLike>(snags: T[]): T[] => snags.filter((s) => !s.dismissedAt);

/** Photo-level rollup used after snag changes. */
export function photoRollup(snags: SnagLike[]): 'all_verified' | 'all_fixed_or_verified' | 'has_open' | 'none' {
  const active = activeSnags(snags);
  if (active.length === 0) return 'none';
  if (active.some((s) => s.status === 'open')) return 'has_open';
  if (active.every((s) => s.status === 'verified')) return 'all_verified';
  return 'all_fixed_or_verified';
}
