import { ConfigError, loadConfig } from './config/config.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const app = await createApp(config);
  await app.listen({ port: config.PORT, host: config.HOST });
}

void main();
