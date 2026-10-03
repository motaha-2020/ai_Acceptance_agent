import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { USERS } from './stack/config.mjs';
import { SCREENS_DIR, apiAs, setLocale, uiLogin } from './helpers';

/**
 * Captures the main screens in Arabic (RTL) and English (LTR), plus dark mode, into
 * apps/web/test-results/screens/ (gitignored). Also fails on page errors and console errors.
 */
mkdirSync(SCREENS_DIR, { recursive: true });

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: path.join(SCREENS_DIR, `${name}.png`), fullPage: false });
}

for (const locale of ['ar', 'en'] as const) {
  test.describe(`screens (${locale})`, () => {
    test.beforeEach(async ({ context }) => {
      await setLocale(context, locale);
    });

    test(`reviewer screens ${locale}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));

      await page.goto('/login');
      await shot(page, `${locale}-01-login`);
      await uiLogin(page, USERS.reviewer, '/review');
      await expect(page.getByTestId('current-category')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('aside[data-photo-id] img, [data-testid=photo-frame] img').first()).toBeVisible();
      await shot(page, `${locale}-02-review-queue`);

      // staged snag + decision dialog
      await page.keyboard.press('KeyS');
      await page.getByRole('dialog').getByRole('combobox').fill('label');
      await settle(page);
      await shot(page, `${locale}-03-snag-picker`);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot(page, `${locale}-04-decision-dialog`);
      await page.keyboard.press('Escape');

      await page.keyboard.press('Shift+Slash');
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot(page, `${locale}-05-shortcuts`);
      await page.keyboard.press('Escape');

      await page.goto('/sites');
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      await shot(page, `${locale}-06-sites`);
      await page.getByRole('row').nth(1).click();
      await expect(page.getByRole('tab').first()).toBeVisible();
      await expect(page.getByRole('list').filter({ has: page.getByRole('img') }).first()).toBeVisible();
      await shot(page, `${locale}-07-site-detail`);
      await page.goto('/snags');
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      await shot(page, `${locale}-08-snag-tracker`);
      await page.goto('/accuracy');
      await expect(page.locator('table')).toBeVisible();
      await shot(page, `${locale}-09-accuracy`);
      await page.goto('/reports');
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      await shot(page, `${locale}-10-reports`);
      await page.goto('/app');
      await shot(page, `${locale}-11-app-download`);

      expect(errors).toEqual([]);
    });

    test(`admin screens ${locale}`, async ({ page }) => {
      await uiLogin(page, USERS.admin, '/admin/users');
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      await shot(page, `${locale}-12-admin-users`);
      await page.goto('/admin/projects');
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      await shot(page, `${locale}-13-admin-projects`);
    });
  });
}

test('dark mode review screen (Arabic) and mobile layout', async ({ page, context }) => {
  await setLocale(context, 'ar');
  await page.emulateMedia({ colorScheme: 'dark' });
  await uiLogin(page, USERS.reviewer, '/review');
  await expect(page.getByTestId('current-category')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await shot(page, 'ar-14-review-dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'ar-15-review-mobile-dark');
  await page.goto('/sites');
  await shot(page, 'ar-16-sites-mobile-dark');
  const metrics = await apiAs(USERS.admin, 'GET', '/metrics/agreement');
  expect(metrics.totals.reviewed).toBeGreaterThan(0);
});
