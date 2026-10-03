import { expect, test } from '@playwright/test';
import { USERS } from './stack/config.mjs';
import { apiAs, firstVisitOfSite, setLocale, uiLogin, uploadAs, waitForPhotoStatus } from './helpers';

test.beforeEach(async ({ context }) => {
  await setLocale(context, 'en');
});

test.describe('administration', () => {
  test('admin creates, edits and deactivates a user', async ({ page }) => {
    await uiLogin(page, USERS.admin, '/admin/users');
    await page.getByTestId('create-user').click();
    const dialog = page.getByRole('dialog', { name: /create user/i });
    await dialog.getByLabel('Email').fill('new.engineer@acceptance.local');
    await dialog.getByLabel('Name').fill('Nour Engineer');
    await dialog.getByLabel('Password').fill('Short');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert').first()).toBeVisible(); // password too short: validated with the shared zod schema
    await dialog.getByLabel('Password').fill('A-long-enough-pass-1');
    await dialog.getByLabel('Role').click();
    await page.getByRole('option', { name: /engineer/i }).first().click();
    await dialog.getByRole('button', { name: 'Save' }).click();

    const row = page.getByRole('row', { name: /nour engineer/i });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Engineer');

    await row.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: /edit user/i });
    await edit.getByLabel('Name').fill('Nour Senior Engineer');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /nour senior engineer/i })).toBeVisible();

    await page.getByRole('row', { name: /nour senior engineer/i }).getByRole('button', { name: 'Deactivate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('row', { name: /nour senior engineer/i })).toContainText('Inactive');

    const users = await apiAs(USERS.admin, 'GET', '/users?q=nour');
    expect(users.items[0]).toMatchObject({ name: 'Nour Senior Engineer', isActive: false, role: 'engineer' });
  });

  test('admin creates a project and a site', async ({ page }) => {
    await uiLogin(page, USERS.admin, '/admin/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    const project = page.getByRole('dialog', { name: /create project/i });
    await project.getByLabel(/^Code/).fill('E2E-PROJ');
    await project.getByLabel(/^Name/).fill('E2E Project');
    await project.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /E2E Project/ })).toBeVisible();

    await page.getByRole('tab', { name: 'Sites' }).click();
    await page.getByRole('button', { name: 'New site' }).click();
    const site = page.getByRole('dialog', { name: /create site/i });
    await site.getByLabel(/^Project/).click();
    await page.getByRole('option', { name: 'E2E Project' }).click();
    await site.getByLabel(/^Code/).fill('e2e-site-1');
    await site.getByLabel(/^Name/).fill('E2E Site One');
    await site.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /E2E Site One/ })).toBeVisible();
    const sites = await apiAs(USERS.admin, 'GET', '/sites?q=E2E');
    expect(sites.items.map((s: { code: string }) => s.code)).toContain('e2e-site-1');
  });
});

test.describe('sites, snag tracker and reports', () => {
  test('site detail shows progress per category and the review shortcut', async ({ page }) => {
    await uiLogin(page, USERS.reviewer, '/sites');
    await page.getByRole('row', { name: /Demo site ASR-9902/ }).click();
    await expect(page).toHaveURL(/\/sites\/[\w-]+$/);
    await expect(page.getByRole('heading', { name: 'Demo site ASR-9902' })).toBeVisible();
    const progress = page.getByRole('list', { name: 'Progress per category' });
    await expect(progress.getByRole('listitem').nth(1)).toBeVisible();
    await expect(progress.getByRole('img').first()).toHaveAttribute('aria-label', /approved/);
    await expect(page.getByRole('link', { name: /Review \d+ pending/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Photos' }).click();
    await expect(page.locator('ul img').first()).toBeVisible();
  });

  test('snag lifecycle: open -> technician re-shot (fixed) -> reviewer verifies in the tracker', async ({ page }) => {
    const open = await apiAs(USERS.admin, 'GET', '/snags?status=open&pageSize=50');
    const snag = open.items.find((s: { photo: { status: string } }) => s.photo.status === 'rejected');
    expect(snag).toBeTruthy();
    const { visitId } = await firstVisitOfSite(0);
    const reshot = await uploadAs(USERS.technician, { visitId, category: snag.photo.category, label: 'e2e reshoot', seed: 301, fixesPhotoId: snag.photoId });
    await waitForPhotoStatus(reshot, 'pending_review');
    await apiAs(USERS.technician, 'POST', `/snags/${snag.id}/fix`, { fixPhotoId: reshot, note: 'Re-bundled' });

    await uiLogin(page, USERS.reviewer, '/snags');
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Fixed' }).click();
    const row = page.getByRole('row').filter({ hasText: snag.code });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Verify' }).click();
    await expect.poll(async () => (await apiAs(USERS.admin, 'GET', `/snags/${snag.id}`)).status).toBe('verified');
  });

  test('reports page lists readiness per site and offers final/draft generation', async ({ page }) => {
    await uiLogin(page, USERS.pm, '/reports');
    await expect(page.getByText(/Reports follow the SID layout/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draft' }).first()).toBeEnabled();
    await expect(page.getByText(/blocked|in progress|ready/i).first()).toBeVisible();
  });

  test('accuracy dashboard shows agreement per category once reviews exist', async ({ page }) => {
    await uiLogin(page, USERS.pm, '/accuracy');
    await expect(page.getByRole('heading', { name: 'AI accuracy' })).toBeVisible();
    await expect(page.getByText('Agreement with AI')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Autonomy readiness' })).toBeVisible();
    await expect(page.getByRole('img', { name: /bar chart of agreement/i })).toBeVisible();
  });

  test('mobile app page shows the coming-soon stub until the API exposes a release', async ({ page }) => {
    await uiLogin(page, USERS.reviewer, '/app');
    await expect(page.getByText('Coming soon')).toBeVisible();
  });
});
