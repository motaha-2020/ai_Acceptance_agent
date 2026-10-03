import { defineConfig } from '@playwright/test';
import { API_URL, WEB_PORT, WEB_URL } from './e2e/stack/config.mjs';

/**
 * End-to-end tests run against the REAL API on embedded PostgreSQL (fake AI provider, local disk
 * storage; see e2e/stack). Set E2E_CHANNEL=msedge|chrome to use an installed browser instead of
 * the Playwright download. E2E_DEV=1 serves `next dev` instead of a production build.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results/artifacts',
  globalSetup: './e2e/global-setup.mjs',
  use: {
    baseURL: WEB_URL,
    channel: process.env.E2E_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: process.env.E2E_DEV ? `pnpm exec next dev -p ${WEB_PORT}` : `pnpm exec next build && pnpm exec next start -p ${WEB_PORT}`,
    url: `${WEB_URL}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: { API_URL, COOKIE_SECURE: 'false' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
