import { defineConfig } from 'vitest/config';

// Unit tests cover the pure logic (offline queue, sync state machine, forced-update gate, OTA
// decisions). They never import react-native; native modules sit behind small ports.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
