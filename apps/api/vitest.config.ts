import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Integration files share one embedded PostgreSQL database.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
