import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSION_MATRIX, Role } from '@acceptance/shared';
import { useHotkeys } from '@/features/review/use-hotkeys';
import { can } from '@/lib/rbac';
import { decodeClaims, isFresh, safeNext } from '@/lib/auth/constants';
import { buildQuery } from '@/lib/api/client';
import { formatNumber, formatPercent } from '@/lib/format';
import { searchSnags, snagTitles, categoryTitle } from '@/lib/taxonomy';
import { computeProgress } from '@/features/sites/progress';
import { readinessOf } from '@/features/reports/reports-page';
import { categoryStatus, weekWindows } from '@/features/accuracy/accuracy-dashboard';
import { NAV_ITEMS } from '@/components/shell/nav';
import type { CategoryAgreementDto } from '@/lib/api/types';

describe('RBAC helper (shared permission matrix)', () => {
  it('reviewers review and approve photos; viewers and technicians cannot', () => {
    expect(can('reviewer', 'review', 'Photo')).toBe(true);
    expect(can('reviewer', 'approve', 'Photo')).toBe(true);
    expect(can('viewer', 'review', 'Photo')).toBe(false);
    expect(can('technician', 'review', 'Photo')).toBe(false);
    expect(can('pm', 'review', 'Photo')).toBe(false);
  });

  it('only admins manage users and projects', () => {
    for (const role of Role.options) {
      expect(can(role, 'create', 'User')).toBe(role === 'admin');
    }
    expect(can('pm', 'create', 'Project')).toBe(true);
    expect(can('admin', 'delete', 'Device')).toBe(true);
  });

  it('is derived from the shared matrix: every role has rules, undefined role has none', () => {
    for (const role of Role.options) expect(PERMISSION_MATRIX[role].length).toBeGreaterThan(0);
    expect(can(undefined, 'read', 'Site')).toBe(false);
  });

  it('navigation entries per role', () => {
    const visible = (role: Parameters<typeof can>[0]) => NAV_ITEMS.filter((i) => can(role, i.needs.action, i.needs.subject)).map((i) => i.href);
    expect(visible('reviewer')).toContain('/review');
    expect(visible('reviewer')).not.toContain('/admin/users');
    expect(visible('admin')).toEqual(expect.arrayContaining(['/review', '/admin/users', '/admin/projects', '/accuracy', '/reports']));
    expect(visible('viewer')).not.toContain('/review');
    expect(visible('technician')).not.toContain('/accuracy');
  });
});

function HotkeyProbe({ onA, enabled = true }: { onA: () => void; enabled?: boolean }) {
  useHotkeys({ KeyA: onA, 'Shift+Slash': onA }, enabled);
  return <input aria-label="field" />;
}

describe('useHotkeys', () => {
  it('fires on the physical key so Arabic keyboard layouts work', async () => {
    const onA = vi.fn();
    render(<HotkeyProbe onA={onA} />);
    // Arabic layout: key = 'ش' but the physical key code is still KeyA
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ش', code: 'KeyA', bubbles: true }));
    expect(onA).toHaveBeenCalledTimes(1);
    // "؟" is Shift+Slash on the Arabic layout
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '؟', code: 'Slash', shiftKey: true, bubbles: true }));
    expect(onA).toHaveBeenCalledTimes(2);
  });

  it('ignores typing in fields, modified keys and disabled state', async () => {
    const onA = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<HotkeyProbe onA={onA} />);
    await user.click(screen.getByLabelText('field'));
    await user.keyboard('a');
    expect(onA).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Control>}a{/Control}');
    expect(onA).not.toHaveBeenCalled();
    rerender(<HotkeyProbe onA={onA} enabled={false} />);
    await user.keyboard('a');
    expect(onA).not.toHaveBeenCalled();
  });
});

describe('auth helpers', () => {
  const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
  it('decodes claims and checks freshness', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    expect(decodeClaims(token({ sub: 'u', role: 'admin', exp }))).toEqual({ sub: 'u', role: 'admin', exp });
    expect(decodeClaims('garbage')).toBeNull();
    expect(isFresh(decodeClaims(token({ sub: 'u', role: 'admin', exp })))).toBe(true);
    expect(isFresh(decodeClaims(token({ sub: 'u', role: 'admin', exp: exp - 1200 })))).toBe(false);
    expect(isFresh(null)).toBe(false);
  });

  it('safeNext only allows same-origin app paths (open-redirect guard)', () => {
    expect(safeNext('/review?siteId=1')).toBe('/review?siteId=1');
    for (const bad of ['https://evil.test', '//evil.test', '/\\evil', '/api/auth/logout', '', null, undefined]) expect(safeNext(bad)).toBe('/');
  });
});

describe('formatting and queries', () => {
  it('uses Latin digits in Arabic and builds clean query strings', () => {
    expect(formatNumber(1234, 'ar')).toMatch(/1.?234/);
    expect(formatPercent(0.982, 'ar')).toMatch(/98/);
    expect(buildQuery({ a: 1, b: '', c: undefined, d: 'x y', e: false })).toBe('?a=1&d=x+y&e=false');
    expect(buildQuery({})).toBe('');
  });
});

describe('taxonomy search', () => {
  it('finds snags in Arabic and English and ranks the current category first', () => {
    expect(searchSnags('ليبل').length).toBeGreaterThan(0);
    expect(searchSnags('label').map((d) => d.code)).toContain('LABEL_MISSING');
    const ranked = searchSnags('label', 'odf_tie_labels');
    expect(ranked[0]?.categories).toContain('odf_tie_labels');
    expect(searchSnags('zzzzqqq')).toEqual([]);
  });

  it('titles are bilingual with the UI language first', () => {
    const ar = snagTitles('LABEL_MISSING', 'ar');
    const en = snagTitles('LABEL_MISSING', 'en');
    expect(ar.primary).toBe(en.secondary);
    expect(/[؀-ۿ]/.test(ar.primary)).toBe(true);
    expect(categoryTitle('rack', 'ar')).not.toBe(categoryTitle('rack', 'en'));
  });
});

describe('site progress, report readiness, accuracy status', () => {
  it('aggregates approved / pending / rejected per category', () => {
    const p = computeProgress([
      { category: 'rack', status: 'approved' },
      { category: 'rack', status: 'pending_review' },
      { category: 'rack', status: 'fixed' },
      { category: 'router', status: 'rejected' },
      { category: 'router', status: 'approved' },
    ]);
    expect(p).toMatchObject({ approved: 2, pending: 2, rejected: 1, total: 5 });
    expect(p.rows.find((r) => r.category === 'rack')).toMatchObject({ approved: 1, pending: 2, rejected: 0 });
  });

  it('a site is blocked while open snags exist', () => {
    expect(readinessOf({ approved: 10, pending: 0, openSnags: 1 })).toBe('blocked');
    expect(readinessOf({ approved: 10, pending: 2, openSnags: 0 })).toBe('inProgress');
    expect(readinessOf({ approved: 0, pending: 0, openSnags: 0 })).toBe('inProgress');
    expect(readinessOf({ approved: 10, pending: 0, openSnags: 0 })).toBe('ready');
  });

  const cat = (over: Partial<CategoryAgreementDto>): CategoryAgreementDto => ({
    category: 'rack', reviewed: 10, withAi: 10, agree: 9, override: 1, addSnag: 0, verdictMatch: 9, agreementRate: 0.9, verdictAccuracy: 0.9,
    aiSnags: 0, aiSnagsDismissed: 0, humanSnags: 0, snagPrecision: null, snagRecall: null,
    policy: { enabled: false, minSamples: 200, minAgreement: 0.98, minConfidence: 0.9 }, meetsThreshold: false, ...over,
  });

  it('classifies categories against the autonomy policy', () => {
    expect(categoryStatus(cat({ withAi: 0 }))).toBe('noData');
    expect(categoryStatus(cat({}))).toBe('needsSamples');
    expect(categoryStatus(cat({ withAi: 300, agreementRate: 0.9 }))).toBe('below');
    expect(categoryStatus(cat({ withAi: 300, agreementRate: 0.99, meetsThreshold: true }))).toBe('meets');
    expect(categoryStatus(cat({ policy: null }))).toBe('noPolicy');
  });

  it('builds eight contiguous weekly windows ending now', () => {
    const now = new Date('2026-10-03T00:00:00Z');
    const w = weekWindows(now);
    expect(w).toHaveLength(8);
    expect(w.at(-1)?.to.getTime()).toBe(now.getTime());
    for (let i = 1; i < w.length; i++) expect(w[i]!.from.getTime()).toBe(w[i - 1]!.to.getTime());
  });
});
