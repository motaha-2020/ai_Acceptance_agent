import { describe, expect, it } from 'vitest';
import { PhotoStatus } from '@acceptance/shared';
import { DomainError } from '../src/core/errors.js';
import { assertPhotoTransition, canTransitionPhoto, PHOTO_TRANSITIONS } from '../src/photos/photo-state.js';
import { canDismiss, nextSnagStatus, photoRollup, type SnagLike } from '../src/snags/snag-state.js';
import { VISIT_TRANSITIONS } from '../src/visits/visits.service.js';

describe('photo state machine', () => {
  const allowed: [string, string][] = [
    ['captured', 'uploaded'],
    ['uploaded', 'ai_analyzed'],
    ['uploaded', 'pending_review'],
    ['ai_analyzed', 'pending_review'],
    ['ai_analyzed', 'approved'],
    ['pending_review', 'approved'],
    ['pending_review', 'rejected'],
    ['pending_review', 'uploaded'],
    ['rejected', 'fixed'],
    ['fixed', 'approved'],
    ['fixed', 'rejected'],
  ];

  it('allows exactly the documented transitions', () => {
    const actual: [string, string][] = [];
    for (const from of PhotoStatus.options) for (const to of PhotoStatus.options) if (canTransitionPhoto(from, to)) actual.push([from, to]);
    expect(actual.sort()).toEqual(allowed.sort());
  });

  it('approved is terminal and rejected cannot be approved without a fix', () => {
    expect(PHOTO_TRANSITIONS.approved).toEqual([]);
    expect(() => assertPhotoTransition('rejected', 'approved')).toThrow(DomainError);
    expect(() => assertPhotoTransition('uploaded', 'approved')).toThrow(/cannot go from uploaded to approved/);
  });
});

describe('snag state machine', () => {
  it('follows open -> fixed -> verified and fixed -> open', () => {
    expect(nextSnagStatus('open', 'fix')).toBe('fixed');
    expect(nextSnagStatus('fixed', 'verify')).toBe('verified');
    expect(nextSnagStatus('fixed', 'reopen')).toBe('open');
  });

  it('rejects skipped or terminal transitions with a 409', () => {
    for (const [from, event] of [['open', 'verify'], ['open', 'reopen'], ['verified', 'reopen'], ['verified', 'fix'], ['fixed', 'fix']] as const) {
      try {
        nextSnagStatus(from, event);
        expect.fail(`${from} --${event}--> should throw`);
      } catch (e) {
        expect((e as DomainError).status).toBe(409);
        expect((e as DomainError).code).toBe('INVALID_STATE_TRANSITION');
      }
    }
  });

  it('dismissed snags accept no events and only open snags can be dismissed', () => {
    expect(() => nextSnagStatus('open', 'fix', true)).toThrow(/dismissed/);
    expect(canDismiss('open', false)).toBe(true);
    expect(canDismiss('open', true)).toBe(false);
    expect(canDismiss('fixed', false)).toBe(false);
  });

  it('rolls snag progress up to the photo, ignoring dismissed snags', () => {
    const s = (status: SnagLike['status'], dismissed = false): SnagLike => ({ status, dismissedAt: dismissed ? new Date() : null });
    expect(photoRollup([])).toBe('none');
    expect(photoRollup([s('open', true)])).toBe('none');
    expect(photoRollup([s('open'), s('fixed')])).toBe('has_open');
    expect(photoRollup([s('fixed'), s('verified'), s('open', true)])).toBe('all_fixed_or_verified');
    expect(photoRollup([s('verified'), s('verified')])).toBe('all_verified');
  });
});

describe('visit state machine', () => {
  it('closed and cancelled visits are terminal', () => {
    expect(VISIT_TRANSITIONS.closed).toEqual([]);
    expect(VISIT_TRANSITIONS.cancelled).toEqual([]);
    expect(VISIT_TRANSITIONS.planned).toContain('in_progress');
    expect(VISIT_TRANSITIONS.submitted).toEqual(['in_progress', 'closed']);
  });
});
