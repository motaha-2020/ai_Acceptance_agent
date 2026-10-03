// Usage: node e2e/stack/run-stack.mjs [--persist] [--demo]
//   --persist  keep the database between runs (.e2e-data/dev)
//   --demo     create demo users + upload sample photos (idempotent per fresh database)
import { startStack } from './stack.mjs';
import { seedDemoData } from './demo-data.mjs';
import { API_URL } from './config.mjs';

const persist = process.argv.includes('--persist');
const stack = await startStack({ persist });
if (process.argv.includes('--demo')) {
  await seedDemoData({ apiUrl: API_URL, prisma: stack.prisma, log: console.log });
}
console.log('[stack] ready');
const stop = async () => {
  await stack.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
