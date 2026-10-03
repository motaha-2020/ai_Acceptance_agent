import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewWorkspace } from '@/features/review/review-workspace';
import type { ReviewFilters } from '@/features/review/review-filters';
import type { QueueItem } from '@/lib/api/types';
import { installFetch, makeItem, makeSnag, renderApp, type FetchCall } from './utils';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), info: vi.fn(), warning: vi.fn(), success: vi.fn() }) }));

const filters: ReviewFilters = { status: 'pending_review' };

function aiVerdict(item: QueueItem, verdict: 'accept' | 'reject' | 'uncertain'): QueueItem {
  return { ...item, analysis: { ...item.analysis!, verdict } };
}

function setup(items: QueueItem[], extra: Array<(c: FetchCall) => { status?: number; json?: unknown } | undefined> = [], opts: Parameters<typeof renderApp>[1] = {}) {
  const fetchState = installFetch([
    ...extra,
    (c) => (c.method === 'GET' && c.path === '/reviews/queue' ? { json: { items, total: items.length, page: 1, pageSize: 50 } } : undefined),
    (c) => (c.method === 'GET' && c.path === '/users' ? { json: { items: [{ id: 'tech1', name: 'Hassan Technician' }], total: 1, page: 1, pageSize: 200 } } : undefined),
    (c) => (c.method === 'POST' ? { json: {} } : undefined),
  ]);
  const user = userEvent.setup();
  const utils = renderApp(<ReviewWorkspace filters={filters} onFiltersChange={() => undefined} />, opts);
  return { user, ...utils, ...fetchState };
}

const posts = (calls: FetchCall[]) => calls.filter((c) => c.method === 'POST').map((c) => `${c.path}${c.body ? ' ' + JSON.stringify(c.body) : ''}`);

describe('ReviewWorkspace', () => {
  it('A agrees with an accepting AI: records an agree label, approves and advances to the next photo', async () => {
    const first = aiVerdict(makeItem('p1', { category: 'rack' }), 'accept');
    const second = aiVerdict(makeItem('p2', { category: 'router' }), 'accept');
    const { user, calls } = setup([first, second]);

    expect(await screen.findByTestId('current-category')).toHaveTextContent(/rack/i);
    await user.keyboard('a');

    await waitFor(() => expect(posts(calls)).toEqual(['/photos/p1/reviews {"decision":"agree"}', '/photos/p1/approve']));
    await waitFor(() => expect(screen.getByTestId('current-category')).toHaveTextContent(/router/i));
  });

  it('A on an AI rejection confirms it: agree label then reject with the AI snag titles', async () => {
    const snag = makeSnag({ id: 'sn1', photoId: 'p1', code: 'LABEL_MISSING' });
    const item = aiVerdict(makeItem('p1', { snags: [snag] }), 'reject');
    const { user, calls } = setup([item]);
    await screen.findByTestId('ai-snag');
    await user.keyboard('a');
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2));
    const [review, reject] = calls.filter((c) => c.method === 'POST');
    expect(review).toMatchObject({ path: '/photos/p1/reviews', body: { decision: 'agree' } });
    expect(reject?.path).toBe('/photos/p1/reject');
    expect((reject?.body as { reason: string }).reason).toMatch(/label/i);
  });

  it('R opens the override dialog; accepting over an AI rejection dismisses its snags (needs a reason)', async () => {
    const snag = makeSnag({ id: 'sn1', photoId: 'p1' });
    const { user, calls } = setup([aiVerdict(makeItem('p1', { snags: [snag] }), 'reject')]);
    await screen.findByTestId('ai-snag');
    await user.keyboard('r');

    const dialog = await screen.findByRole('dialog', { name: /final decision/i });
    // default is the opposite of the AI verdict
    expect(within(dialog).getByRole('radio', { name: /accept/i })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: /accept photo/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/reason/i);
    expect(posts(calls)).toEqual([]);

    await user.type(within(dialog).getByLabelText(/reason/i), 'Cables are fine on site');
    await user.click(within(dialog).getByRole('button', { name: /accept photo/i }));

    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    expect(calls.find((c) => c.path === '/photos/p1/reviews')?.body).toMatchObject({
      decision: 'override',
      verdict: 'accept',
      reason: 'Cables are fine on site',
      removeSnagIds: ['sn1'],
      addSnags: [],
    });
    expect(posts(calls)[1]).toBe('/photos/p1/approve');
  });

  it('S adds a snag from the Arabic/English taxonomy picker and submits it as add_snag + reject', async () => {
    const { user, calls } = setup([aiVerdict(makeItem('p1', { category: 'odf_tie_labels' }), 'accept')]);
    await screen.findByTestId('current-category');
    await user.keyboard('s');

    const picker = await screen.findByRole('dialog', { name: /add a snag/i });
    await user.type(within(picker).getByRole('combobox'), 'ليبل');
    const options = await within(picker).findAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    await user.keyboard('{Enter}');

    expect(await screen.findByTestId('staged-snag')).toBeInTheDocument();
    await user.keyboard('{Escape}'); // skip drawing a box
    await user.click(screen.getByTestId('submit-edits'));

    const decision = await screen.findByRole('dialog', { name: /final decision/i });
    expect(within(decision).getByRole('radio', { name: /reject/i })).toBeChecked();
    await user.click(within(decision).getByRole('button', { name: /reject photo/i }));

    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    const review = calls.find((c) => c.path === '/photos/p1/reviews')?.body as { decision: string; verdict: string; addSnags: Array<{ code: string }> };
    expect(review).toMatchObject({ decision: 'add_snag', verdict: 'reject' });
    expect(review.addSnags).toHaveLength(1);
    expect(posts(calls)[1]).toMatch(/^\/photos\/p1\/reject /);
  });

  it('N / arrow keys move through the queue and ? opens the shortcut help', async () => {
    const { user } = setup([makeItem('p1', { category: 'rack' }), makeItem('p2', { category: 'router' })]);
    expect(await screen.findByTestId('current-category')).toHaveTextContent(/rack/i);
    await user.keyboard('n');
    expect(screen.getByTestId('current-category')).toHaveTextContent(/router/i);
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('current-category')).toHaveTextContent(/rack/i);
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it('shortcuts are ignored while typing in a field', async () => {
    const { user, calls } = setup([aiVerdict(makeItem('p1', { snags: [makeSnag({ photoId: 'p1' })] }), 'reject')]);
    await screen.findByTestId('ai-snag');
    await user.keyboard('r');
    const dialog = await screen.findByRole('dialog', { name: /final decision/i });
    await user.type(within(dialog).getByLabelText(/reason/i), 'aaa rrr sss');
    expect(posts(calls)).toEqual([]);
  });

  it('on a failed submission the photo comes back with its edits and nothing is lost', async () => {
    const item = aiVerdict(makeItem('p1', { category: 'rack' }), 'accept');
    const { user, calls } = setup([item, aiVerdict(makeItem('p2', { category: 'router' }), 'accept')], [
      (c) => (c.method === 'POST' && c.path === '/photos/p1/approve' ? { status: 409, json: { statusCode: 409, error: { code: 'OPEN_SNAGS', message: 'x' } } } : undefined),
    ]);
    await screen.findByTestId('current-category');
    await user.keyboard('a');
    await waitFor(() => expect(posts(calls)).toContain('/photos/p1/approve'));
    // restored and focused again after the failure
    await waitFor(() => expect(screen.getByTestId('current-category')).toHaveTextContent(/rack/i));
  });

  it('AI uncertain: Agree is disabled with an explanation', async () => {
    setup([aiVerdict(makeItem('p1'), 'uncertain')]);
    const agree = await screen.findByTestId('agree');
    expect(agree).toBeDisabled();
    expect(agree).toHaveAttribute('title', expect.stringMatching(/uncertain/i));
  });

  it('shows an empty state when the queue is clear', async () => {
    setup([]);
    expect(await screen.findByText(/queue is clear/i)).toBeInTheDocument();
  });

  it('roles without review permission see a notice instead of the workspace (RBAC gating)', async () => {
    setup([makeItem('p1')], [], { role: 'viewer' });
    expect(await screen.findByText(/cannot review photos/i)).toBeInTheDocument();
    expect(screen.queryByTestId('agree')).not.toBeInTheDocument();
  });

  it('renders Arabic labels with the AI snag title in Arabic first (RTL content)', async () => {
    const snag = makeSnag({ id: 'sn1', photoId: 'p1', code: 'LABEL_MISSING' });
    setup([aiVerdict(makeItem('p1', { snags: [snag] }), 'reject')], [], { locale: 'ar' });
    const row = await screen.findByTestId('ai-snag');
    expect(row).toHaveTextContent(/[؀-ۿ]/); // Arabic primary title
    expect(row).toHaveTextContent(/label/i); // English secondary + code
    expect(screen.getByTestId('agree')).toHaveTextContent('موافقة');
  });

  it('shows reviewers when a photo came from a bulk upload rather than the field camera', async () => {
    setup([makeItem('p1', { captureSource: 'web_bulk', fileName: 'site-a/PDU/pdu (1).jpeg' })], [], { locale: 'en' });
    expect(await screen.findByText('Bulk upload (web)')).toBeInTheDocument();
    expect(screen.getByText('pdu (1).jpeg')).toBeInTheDocument();
  });
});
