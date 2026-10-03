import { expect, test } from '@playwright/test';
import { USERS } from './stack/config.mjs';
import { setLocale, uiLogin } from './helpers';

test.describe('authentication', () => {
  test.beforeEach(async ({ context }) => {
    await setLocale(context, 'en');
  });

  test('unauthenticated visitors are redirected to the login page and brought back after sign-in', async ({ page }) => {
    await page.goto('/review?category=rack');
    await expect(page).toHaveURL(/\/login\?next=%2Freview%3Fcategory%3Drack/);
    await page.locator('#email').fill(USERS.reviewer.email);
    await page.locator('#password').fill(USERS.reviewer.password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/review\?category=rack/);
    await expect(page.getByTestId('current-category')).toBeVisible();
  });

  test('wrong credentials show an error and keep the user on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(USERS.reviewer.email);
    await page.locator('#password').fill('definitely-not-the-password');
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('alert').first()).toContainText(/wrong email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('tokens live only in httpOnly cookies, never in storage or document.cookie', async ({ page, context }) => {
    await uiLogin(page, USERS.reviewer);
    const cookies = await context.cookies();
    const access = cookies.find((c) => c.name === 'acc_at');
    const refresh = cookies.find((c) => c.name === 'acc_rt');
    expect(access?.httpOnly).toBe(true);
    expect(refresh?.httpOnly).toBe(true);
    expect(access?.sameSite).toBe('Lax');
    const leaked = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    expect(leaked.cookie).not.toContain('acc_');
    expect(leaked.local).not.toMatch(/eyJ|refresh|token/i);
    expect(leaked.session).not.toMatch(/eyJ|refresh|token/i);
  });

  test('an expired access token is refreshed transparently (single-flight) on navigation and API calls', async ({ page, context }) => {
    await uiLogin(page, USERS.reviewer, '/sites');
    // Simulate access-cookie expiry: drop it, keep the refresh cookie.
    const kept = (await context.cookies()).filter((c) => c.name !== 'acc_at');
    await context.clearCookies();
    await context.addCookies(kept);
    await page.goto('/sites');
    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === 'acc_at')).toBe(true);
    // Concurrent proxy calls with an expired token must not trip refresh-token reuse detection.
    const kept2 = (await context.cookies()).filter((c) => c.name !== 'acc_at');
    await context.clearCookies();
    await context.addCookies(kept2);
    const statuses = await page.evaluate(async () => (await Promise.all(Array.from({ length: 6 }, () => fetch('/api/proxy/sites?pageSize=1')))).map((r) => r.status));
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  });

  test('sign out clears the session and protects pages again', async ({ page }) => {
    await uiLogin(page, USERS.reviewer);
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/sites');
    await expect(page).toHaveURL(/\/login\?next=%2Fsites/);
  });

  test('language toggle flips direction between RTL Arabic and LTR English', async ({ page, context }) => {
    await setLocale(context, 'ar');
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await page.getByRole('button', { name: /english/i }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/acceptance portal/i);
  });
});

test.describe('role based access in the UI', () => {
  test.beforeEach(async ({ context }) => {
    await setLocale(context, 'en');
  });

  test('a viewer sees no review or admin entries and gets a notice on those pages', async ({ page }) => {
    await uiLogin(page, USERS.viewer);
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    await expect(nav.getByRole('link', { name: 'Sites' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Review queue' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page.getByText(/you don't have access/i)).toBeVisible();
    await page.goto('/review');
    await expect(page.getByText(/cannot review photos/i)).toBeVisible();
  });

  test('an administrator sees the administration entries', async ({ page }) => {
    await uiLogin(page, USERS.admin);
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Projects & sites' })).toBeVisible();
  });
});
