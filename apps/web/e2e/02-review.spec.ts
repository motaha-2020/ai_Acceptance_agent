import { expect, test } from '@playwright/test';
import { USERS } from './stack/config.mjs';
import { apiAs, currentPhotoId, firstVisitOfSite, setLocale, uiLogin, uploadAs, waitForPhotoStatus } from './helpers';

test.describe('review queue against the real API', () => {
  const ids: { accept: string; override: string; addSnag: string } = { accept: '', override: '', addSnag: '' };

  test.beforeAll(async () => {
    // Test setup uploads photos through the API exactly like the mobile app would.
    const { visitId } = await firstVisitOfSite(0);
    ids.accept = await uploadAs(USERS.technician, { visitId, category: 'router', label: 'e2e agree', seed: 101 });
    ids.override = await uploadAs(USERS.technician, { visitId, category: 'patch_cords', label: 'e2e override', seed: 102 });
    ids.addSnag = await uploadAs(USERS.technician, { visitId, category: 'duct', label: 'e2e add snag', seed: 103 });
    for (const id of Object.values(ids)) await waitForPhotoStatus(id, 'pending_review');
  });

  test.beforeEach(async ({ page, context }) => {
    await setLocale(context, 'en');
    await uiLogin(page, USERS.reviewer, '/review');
  });

  test('queue is oldest first and shows the AI verdict, confidence, snags and photo metadata', async ({ page }) => {
    await expect(page.getByTestId('queue-count')).toContainText(/\d+ waiting/);
    const first = await currentPhotoId(page);
    const queue = await apiAs(USERS.reviewer, 'GET', '/reviews/queue?pageSize=50');
    expect(queue.items[0].id).toBe(first); // FIFO
    await expect(page.getByTestId('ai-verdict')).toContainText(/AI verdict/);
    await expect(page.getByTestId('ai-confidence')).toHaveText(/\d+%/);
    await expect(page.getByText('Photo details')).toBeVisible();
    await expect(page.getByText('Hassan Technician')).toBeVisible(); // technician resolved from the user list
  });

  test('A agrees with the AI: photo approved, review label stored, next photo shown automatically', async ({ page }) => {
    await page.goto('/review?category=router');
    // Walk to the photo we uploaded (queue is FIFO, earlier demo photos come first).
    for (let i = 0; i < 6 && (await currentPhotoId(page)) !== ids.accept; i++) await page.keyboard.press('n');
    expect(await currentPhotoId(page)).toBe(ids.accept);
    await page.keyboard.press('a');
    await waitForPhotoStatus(ids.accept, 'approved');
    const detail = await apiAs(USERS.admin, 'GET', `/photos/${ids.accept}`);
    expect(detail.reviews[0]).toMatchObject({ decision: 'agree', verdict: 'accept' });
  });

  test('R overrides an AI rejection: dismissed snags are kept as negative labels, photo approved', async ({ page }) => {
    await page.goto('/review?category=patch_cords');
    for (let i = 0; i < 6 && (await currentPhotoId(page)) !== ids.override; i++) await page.keyboard.press('n');
    expect(await currentPhotoId(page)).toBe(ids.override);
    await expect(page.getByTestId('ai-snag')).toHaveCount(2);

    await page.keyboard.press('r');
    const dialog = page.getByRole('dialog', { name: /final decision/i });
    await expect(dialog.getByRole('radio', { name: /accept/i })).toBeChecked(); // opposite of the AI's reject
    await dialog.getByLabel(/reason/i).fill('Cords are bundled correctly, AI misread the shadow');
    await dialog.getByRole('button', { name: /accept photo/i }).click();

    await waitForPhotoStatus(ids.override, 'approved');
    const detail = await apiAs(USERS.admin, 'GET', `/photos/${ids.override}`);
    expect(detail.reviews[0]).toMatchObject({ decision: 'override', verdict: 'accept', aiVerdict: 'reject' });
    const snags = await apiAs(USERS.admin, 'GET', `/snags?photoId=${ids.override}&includeDismissed=true`);
    expect(snags.items.length).toBe(2);
    expect(snags.items.every((s: { dismissedAt: string | null }) => s.dismissedAt)).toBe(true);
  });

  test('S adds a snag found by searching in Arabic, draws its box on the photo and rejects', async ({ page }) => {
    await page.goto('/review?category=duct');
    for (let i = 0; i < 6 && (await currentPhotoId(page)) !== ids.addSnag; i++) await page.keyboard.press('n');
    expect(await currentPhotoId(page)).toBe(ids.addSnag);

    await page.keyboard.press('s');
    const picker = page.getByRole('dialog', { name: /add a snag/i });
    await picker.getByRole('combobox').fill('دكت'); // Arabic search term
    const options = picker.getByRole('option');
    if ((await options.count()) === 0) await picker.getByRole('combobox').fill('duct');
    await expect(options.first()).toBeVisible();
    await page.keyboard.press('Enter');

    // draw the optional box
    const frame = page.getByTestId('photo-frame');
    const box = (await frame.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('staged-snag')).toBeVisible();

    await page.getByTestId('submit-edits').click();
    const dialog = page.getByRole('dialog', { name: /final decision/i });
    await expect(dialog.getByRole('radio', { name: /reject/i })).toBeChecked();
    await dialog.getByRole('button', { name: /reject photo/i }).click();

    await waitForPhotoStatus(ids.addSnag, 'rejected');
    const detail = await apiAs(USERS.admin, 'GET', `/photos/${ids.addSnag}`);
    expect(detail.reviews[0]).toMatchObject({ decision: 'add_snag', verdict: 'reject' });
    const human = detail.snags.find((s: { source: string }) => s.source === 'human');
    expect(human).toBeTruthy();
    expect(human.bbox).toMatchObject({ x: expect.any(Number), w: expect.any(Number) });
    expect(human.bbox.w).toBeGreaterThan(0.1);
  });

  test('keyboard help and zoom controls work', async ({ page }) => {
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
    await page.keyboard.press('Escape');
    const zoom = page.getByTestId('zoom-level');
    await expect(zoom).toHaveText('100%');
    await page.keyboard.press('Equal');
    await expect(zoom).not.toHaveText('100%');
    await page.keyboard.press('Digit0');
    await expect(zoom).toHaveText('100%');
    await page.keyboard.press('KeyB'); // hide boxes
    await expect(page.getByRole('button', { name: /toggle snag boxes/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
