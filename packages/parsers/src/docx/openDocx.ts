import JSZip from 'jszip';
import { fileBytes, type FileInput } from '../input.js';

export async function openDocx(input: FileInput): Promise<JSZip> {
  return JSZip.loadAsync(await fileBytes(input));
}

export async function readZipText(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) throw new Error(`Missing ${name} in docx`);
  return entry.async('string');
}
