import { describe, expect, it } from 'vitest';
import { EMPTY_EDITS, planAgree, planDecision, remainingSnags } from '@/features/review/plan';
import { makeItem, makeSnag } from './utils';

const withAi = (verdict: 'accept' | 'reject' | 'uncertain', snags = [] as ReturnType<typeof makeSnag>[]) => {
  const base = makeItem('p1');
  return makeItem('p1', { snags, analysis: { ...base.analysis!, verdict } });
};

describe('planAgree', () => {
  it('AI accept + no snags => agree review then approve', () => {
    const r = planAgree(withAi('accept'), EMPTY_EDITS);
    expect(r).toMatchObject({ ok: true, plan: { review: { decision: 'agree' }, finalize: { kind: 'approve' }, verdict: 'accept' } });
  });

  it('AI reject => agree review then reject with the snag titles as reason', () => {
    const r = planAgree(withAi('reject', [makeSnag({ code: 'LABEL_MISSING' })]), EMPTY_EDITS);
    expect(r.ok && r.plan.finalize.kind).toBe('reject');
    expect(r.ok && r.plan.finalize.kind === 'reject' && r.plan.finalize.reason.length).toBeGreaterThan(3);
  });

  it('refuses uncertain, missing AI result, accept-with-snags and staged edits', () => {
    expect(planAgree(withAi('uncertain'), EMPTY_EDITS)).toEqual({ ok: false, error: 'ai_uncertain' });
    expect(planAgree(makeItem('p1', { analysis: null }), EMPTY_EDITS)).toEqual({ ok: false, error: 'no_ai_result' });
    expect(planAgree(withAi('accept', [makeSnag()]), EMPTY_EDITS)).toEqual({ ok: false, error: 'accept_with_snags' });
    expect(planAgree(withAi('accept'), { added: [{ tempId: 't', code: 'LABEL_MISSING', severity: 'major' }], removed: [] })).toEqual({ ok: false, error: 'has_staged_edits' });
  });
});

describe('planDecision', () => {
  it('overriding AI reject to accept dismisses every snag and approves', () => {
    const s1 = makeSnag();
    const s2 = makeSnag({ code: 'LABEL_MISSING' });
    const r = planDecision(withAi('reject', [s1, s2]), EMPTY_EDITS, 'accept', 'Looks fine on site');
    expect(r).toMatchObject({
      ok: true,
      plan: { decision: 'override', finalize: { kind: 'approve' }, review: { decision: 'override', verdict: 'accept', removeSnagIds: [s1.id, s2.id], addSnags: [] } },
    });
  });

  it('override needs a reason', () => {
    expect(planDecision(withAi('reject', [makeSnag()]), EMPTY_EDITS, 'accept', '  ')).toEqual({ ok: false, error: 'reason_required' });
  });

  it('additions only on top of a reject use add_snag and need no reason', () => {
    const item = withAi('accept');
    const r = planDecision(item, { added: [{ tempId: 't1', code: 'LABEL_MISSING', severity: 'major', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }], removed: [] }, 'reject', '');
    expect(r).toMatchObject({ ok: true, plan: { decision: 'add_snag', finalize: { kind: 'reject' }, review: { decision: 'add_snag', verdict: 'reject' } } });
    expect(r.ok && (r.plan.review.addSnags ?? [])[0]).toMatchObject({ code: 'LABEL_MISSING', bbox: { x: 0.1 } });
  });

  it('removing one snag while keeping another is an override and carries per-snag reasons', () => {
    const keep = makeSnag({ code: 'DUST_OR_DIRT' });
    const drop = makeSnag({ code: 'LABEL_MISSING' });
    const r = planDecision(withAi('reject', [keep, drop]), { added: [], removed: [{ snagId: drop.id, reason: 'not visible' }] }, 'reject', 'AI over-reported');
    expect(r.ok && r.plan.review.reason).toContain('LABEL_MISSING: not visible');
    expect(r.ok && r.plan.review.reason).toContain('AI over-reported');
    expect(r.ok && r.plan.decision).toBe('override');
  });

  it('a rejection needs at least one remaining snag; accepting cannot add snags', () => {
    expect(planDecision(withAi('accept'), EMPTY_EDITS, 'reject', 'bad')).toEqual({ ok: false, error: 'reject_needs_snag' });
    expect(planDecision(withAi('accept'), { added: [{ tempId: 't', code: 'LABEL_MISSING', severity: 'major' }], removed: [] }, 'accept', 'x')).toEqual({ ok: false, error: 'accept_with_added' });
  });

  it('remainingSnags excludes staged removals', () => {
    const a = makeSnag();
    const b = makeSnag();
    expect(remainingSnags(makeItem('p1', { snags: [a, b] }), { added: [], removed: [{ snagId: a.id, reason: 'x' }] })).toEqual([b]);
  });
});
