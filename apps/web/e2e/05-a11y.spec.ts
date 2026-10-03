import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { USERS } from './stack/config.mjs';
import { setLocale, uiLogin } from './helpers';

/** WCAG 2.1 A/AA automated checks (contrast, labels, roles) on the main screens in both themes and languages. */
async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const locale of ['ar', 'en'] as const) {
    test(`no serious accessibility violations: ${locale} / ${scheme}`, async ({ page, context }) => {
      await setLocale(context, locale);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/login');
      expect(await violations(page), 'login').toEqual([]);
      await uiLogin(page, USERS.admin, '/review');
      await expect(page.getByTestId('current-category')).toBeVisible();
      expect(await violations(page), 'review').toEqual([]);
      for (const route of ['/sites', '/snags', '/accuracy', '/reports', '/admin/users']) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        expect(await violations(page), route).toEqual([]);
      }
    });
  }
}
