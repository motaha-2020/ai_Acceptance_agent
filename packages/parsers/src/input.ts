import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * A source file: a filesystem path (CLI tools) or an in-memory upload (API).
 * The name matters: some parsers read the ODF number from it ("Fiber Test ODF2.xlsx").
 */
export type FileInput = string | { name: string; data: Uint8Array };

export function fileName(input: FileInput): string {
  return typeof input === 'string' ? path.basename(input) : input.name;
}

export async function fileBytes(input: FileInput): Promise<Buffer> {
  if (typeof input === 'string') return readFile(input);
  return Buffer.from(input.data.buffer, input.data.byteOffset, input.data.byteLength);
}

export async function fileText(input: FileInput): Promise<string> {
  return (await fileBytes(input)).toString('utf8');
}
