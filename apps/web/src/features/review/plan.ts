import type { BBoxDto, QueueItem, SeverityDto, SnagDto } from '@/lib/api/types';
import type { SubmitReviewRequest } from '@acceptance/shared';
import type { z } from 'zod';
import { snagTitle } from '@/lib/taxonomy';

/**
 * Pure planning logic for review submissions. The review UI collects "staged edits" locally and
 * this module turns a reviewer's intent into the exact API calls:
 *   1. POST /photos/:id/reviews   (immutable training label: agree | override | add_snag)
 *   2. POST /photos/:id/approve | /reject   (moves the photo out of the queue)
 */

export interface StagedSnag {
  tempId: string;
  code: string;
  severity: SeverityDto;
  bbox?: BBoxDto;
}

export interface StagedRemoval {
  snagId: string;
  reason: string;
}

export interface StagedEdits {
  added: StagedSnag[];
  removed: StagedRemoval[];
}

export const EMPTY_EDITS: StagedEdits = { added: [], removed: [] };

export type FinalVerdict = 'accept' | 'reject';

export type PlanError =
  | 'no_ai_result'
  | 'ai_uncertain'
  | 'accept_with_snags'
  | 'has_staged_edits'
  | 'accept_with_added'
  | 'reject_needs_snag'
  | 'reason_required';

export interface ReviewPlan {
  review: z.input<typeof SubmitReviewRequest>;
  finalize: { kind: 'approve' } | { kind: 'reject'; reason: string };
  /** For UI summaries. */
  decision: 'agree' | 'override' | 'add_snag';
  verdict: FinalVerdict;
}

export type PlanResult = { ok: true; plan: ReviewPlan } | { ok: false; error: PlanError };

export function hasEdits(e: StagedEdits | undefined): boolean {
  return !!e && (e.added.length > 0 || e.removed.length > 0);
}

/** Snags currently counted against the photo after applying staged edits (existing minus removed). */
export function remainingSnags(item: Pick<QueueItem, 'snags'>, edits: StagedEdits): SnagDto[] {
  const removed = new Set(edits.removed.map((r) => r.snagId));
  return item.snags.filter((s) => !removed.has(s.id));
}

const MAX_REASON = 2000;

function join(parts: string[]): string {
  return parts.filter(Boolean).join(' | ').slice(0, MAX_REASON);
}

function snagSummary(codes: string[]): string {
  return codes.map((c) => snagTitle(c, 'en')).join('; ');
}

/** "Agree with AI": accept the AI verdict as-is. Only possible without staged edits and with a decisive AI result. */
export function planAgree(item: QueueItem, edits: StagedEdits): PlanResult {
  if (hasEdits(edits)) return { ok: false, error: 'has_staged_edits' };
  const verdict = item.analysis?.verdict;
  if (!item.analysis || !verdict) return { ok: false, error: 'no_ai_result' };
  if (verdict === 'uncertain') return { ok: false, error: 'ai_uncertain' };
  if (verdict === 'accept') {
    if (item.snags.length > 0) return { ok: false, error: 'accept_with_snags' };
    return { ok: true, plan: { review: { decision: 'agree' }, finalize: { kind: 'approve' }, decision: 'agree', verdict: 'accept' } };
  }
  const reason = join([snagSummary(item.snags.map((s) => s.code))]) || 'AI findings confirmed by reviewer';
  return { ok: true, plan: { review: { decision: 'agree' }, finalize: { kind: 'reject', reason }, decision: 'agree', verdict: 'reject' } };
}

/**
 * Explicit decision (override / add snags). `verdict` is the reviewer's final call.
 * - accept: every remaining snag is dismissed (the API refuses to approve open snags).
 * - reject: needs at least one snag afterwards so the technician knows what to fix.
 * - additions only on top of a reject => `add_snag`; anything else => `override` (reason required).
 */
export function planDecision(item: QueueItem, edits: StagedEdits, verdict: FinalVerdict, reason: string): PlanResult {
  const trimmed = reason.trim();
  let removed = edits.removed;
  if (verdict === 'accept') {
    if (edits.added.length > 0) return { ok: false, error: 'accept_with_added' };
    const already = new Set(removed.map((r) => r.snagId));
    removed = [...removed, ...item.snags.filter((s) => !already.has(s.id)).map((s) => ({ snagId: s.id, reason: '' }))];
  } else {
    const remaining = item.snags.length - removed.length + edits.added.length;
    if (remaining < 1) return { ok: false, error: 'reject_needs_snag' };
  }

  const onlyAdditions = verdict === 'reject' && removed.length === 0 && edits.added.length > 0;
  const decision: 'override' | 'add_snag' = onlyAdditions ? 'add_snag' : 'override';
  if (decision === 'override' && !trimmed) return { ok: false, error: 'reason_required' };

  const codeOf = new Map(item.snags.map((s) => [s.id, s.code]));
  const removalNotes = removed.filter((r) => r.reason.trim()).map((r) => `${codeOf.get(r.snagId) ?? r.snagId}: ${r.reason.trim()}`);
  const composed = join([trimmed, ...removalNotes]);

  const review: z.input<typeof SubmitReviewRequest> = {
    decision,
    verdict,
    reason: composed || undefined,
    addSnags: edits.added.map((a) => ({ code: a.code, severity: a.severity, bbox: a.bbox })),
    removeSnagIds: removed.map((r) => r.snagId),
  };
  const finalize: ReviewPlan['finalize'] =
    verdict === 'accept'
      ? { kind: 'approve' }
      : { kind: 'reject', reason: composed || join([snagSummary(edits.added.map((a) => a.code))]) || 'Rejected by reviewer' };
  return { ok: true, plan: { review, finalize, decision, verdict } };
}

const ERROR_KEYS: Record<PlanError, string> = {
  no_ai_result: 'noAi',
  ai_uncertain: 'uncertain',
  accept_with_snags: 'acceptWithSnags',
  has_staged_edits: 'hasEdits',
  accept_with_added: 'acceptWithAdded',
  reject_needs_snag: 'rejectNeedsSnag',
  reason_required: 'reasonRequired',
};

/** Message key under "review.planError". */
export function planErrorKeyOf(error: PlanError): string {
  return ERROR_KEYS[error];
}
