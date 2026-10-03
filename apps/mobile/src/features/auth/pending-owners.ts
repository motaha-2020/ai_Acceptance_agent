import type { KnownUser } from './session';

export interface PendingOwner {
  userId: string;
  count: number;
  /** Name/email when this account signed in on the phone before (null if unknown). */
  user: KnownUser | null;
}

/**
 * Photos waiting on the phone that belong to an account other than `currentUserId` (null on the
 * login screen = every owner). Only the owner's session can upload them, so they must be surfaced.
 */
export function otherPendingOwners(
  pending: ReadonlyArray<{ userId: string; count: number }>,
  known: readonly KnownUser[],
  currentUserId: string | null,
): PendingOwner[] {
  const byId = new Map(known.map((u) => [u.id, u] as const));
  return pending
    .filter((p) => p.count > 0 && p.userId !== currentUserId)
    .map((p) => ({ userId: p.userId, count: p.count, user: byId.get(p.userId) ?? null }));
}
