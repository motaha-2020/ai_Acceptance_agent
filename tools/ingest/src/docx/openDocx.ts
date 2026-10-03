import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

export async function openDocx(file: string): Promise<JSZip> {
  return JSZip.loadAsync(await readFile(file));
}

export async function readZipText(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) throw new Error(`Missing ${name} in docx`);
  return entry.async('string');
}
