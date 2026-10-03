import path from 'node:path';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { API_URL, WEB_URL, USERS, type E2eUser } from './stack/config.mjs';
import { api, login, uploadPhoto } from './stack/demo-data.mjs';

export const SCREENS_DIR = path.join(process.cwd(), 'test-results', 'screens');

export async function setLocale(context: BrowserContext, locale: 'ar' | 'en'): Promise<void> {
  await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: WEB_URL }]);
}

/** Signs in through the real login form. */
export async function uiLogin(page: Page, user: E2eUser, next = '/'): Promise<void> {
  await page.goto(`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`);
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

// The API rate-limits logins per IP; tests call it a lot, so tokens are reused (they live 15 minutes).
const tokens = new Map<string, { token: string; at: number }>();
async function tokenFor(user: E2eUser): Promise<string> {
  const hit = tokens.get(user.email);
  if (hit && Date.now() - hit.at < 8 * 60_000) return hit.token;
  const token = await login(API_URL, user);
  tokens.set(user.email, { token, at: Date.now() });
  return token;
}

/** Direct API access for test setup and verification (what the mobile app / an auditor would see). */
export async function apiAs<T = any>(user: E2eUser, method: string, p: string, body?: unknown): Promise<T> {
  return api<T>(API_URL, await tokenFor(user), method, p, body);
}

export async function uploadAs(user: E2eUser, input: Parameters<typeof uploadPhoto>[2]): Promise<string> {
  const token = await tokenFor(user);
  const res = await uploadPhoto(API_URL, token, input);
  const id = res.photo?.id;
  if (!id) throw new Error(`upload failed: ${JSON.stringify(res)}`);
  return id;
}

export async function waitForPhotoStatus(photoId: string, status: string, ms = 30_000): Promise<void> {
  await expect
    .poll(async () => (await apiAs(USERS.admin, 'GET', `/photos/${photoId}`)).status, { timeout: ms, intervals: [300, 500, 1000] })
    .toBe(status);
}

export async function firstVisitOfSite(siteIndex = 0): Promise<{ visitId: string; siteId: string }> {
  const sites = await apiAs(USERS.admin, 'GET', '/sites?pageSize=50');
  const site = sites.items[siteIndex];
  const visits = await apiAs(USERS.admin, 'GET', `/visits?siteId=${site.id}&pageSize=5`);
  return { visitId: visits.items[0].id, siteId: site.id };
}

/** Id of the photo currently shown in the review panel. */
export async function currentPhotoId(page: Page): Promise<string> {
  const id = await page.locator('aside[data-photo-id]').getAttribute('data-photo-id');
  if (!id) throw new Error('no photo in the review panel');
  return id;
}
