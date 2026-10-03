import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  '/usr/bin/soffice',
  '/usr/lib/libreoffice/program/soffice',
  '/opt/libreoffice/program/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
];

/** Path of LibreOffice's `soffice`: SOFFICE_PATH, then well-known locations. Null when not installed. */
export function findSoffice(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.SOFFICE_PATH) return existsSync(env.SOFFICE_PATH) ? env.SOFFICE_PATH : null;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfConversionError';
  }
}

export interface PdfOptions {
  sofficePath?: string;
  timeoutMs?: number;
}

/**
 * DOCX -> PDF with LibreOffice headless. Each call uses its own temp dir and LibreOffice profile
 * (-env:UserInstallation) so concurrent conversions do not block on a shared profile lock.
 */
export async function convertDocxToPdf(docx: Uint8Array, opts: PdfOptions = {}): Promise<Buffer> {
  const soffice = opts.sofficePath ?? findSoffice();
  if (!soffice) throw new PdfConversionError('LibreOffice (soffice) is not installed');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'report-pdf-'));
  try {
    const input = path.join(dir, 'report.docx');
    await writeFile(input, docx);
    const profile = pathToFileURL(path.join(dir, 'lo-profile')).href;
    await new Promise<void>((resolve, reject) => {
      execFile(
        soffice,
        [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--nologo', '--convert-to', 'pdf', '--outdir', dir, input],
        { timeout: opts.timeoutMs ?? 120_000, windowsHide: true },
        (err, _stdout, stderr) => (err ? reject(new PdfConversionError(`soffice failed: ${err.message} ${String(stderr).slice(0, 500)}`)) : resolve()),
      );
    });
    const out = path.join(dir, 'report.pdf');
    if (!existsSync(out)) throw new PdfConversionError('soffice produced no PDF');
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
