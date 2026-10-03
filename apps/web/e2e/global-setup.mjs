import { API_URL } from './stack/config.mjs';
import { seedDemoData } from './stack/demo-data.mjs';
import { startStack } from './stack/stack.mjs';

/** Boots embedded PostgreSQL + the real API (fake AI provider) and seeds demo users and photos. */
export default async function globalSetup() {
  const stack = await startStack({ persist: false, log: () => undefined });
  await seedDemoData({ apiUrl: API_URL });
  return async () => {
    await stack.stop();
  };
}
