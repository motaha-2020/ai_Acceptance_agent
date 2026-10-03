import type { GlobalSetupContext } from 'vitest/node';
import { startTestDatabase, type TestDatabase } from '@acceptance/db/testing';

let db: TestDatabase | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  db = await startTestDatabase('api_test');
  provide('databaseUrl', db.url);
}

export async function teardown(): Promise<void> {
  await db?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
