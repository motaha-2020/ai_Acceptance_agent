import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeJsonl(file: string, rows: readonly unknown[]): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
