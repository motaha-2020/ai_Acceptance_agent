import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertValidKey, ObjectNotFoundError, type ObjectStorage, type PutOptions, type SignedUrlOptions } from './port.js';

export interface LocalStorageOptions {
  rootDir: string;
  /** Public base URL of the API route that serves signed local files, e.g. http://localhost:3000/files */
  publicBaseUrl: string;
  /** HMAC secret for signed URLs. */
  signingSecret: string;
  /** Clock override for tests. */
  now?: () => number;
}

export interface VerifiedSignedRequest {
  key: string;
  downloadName?: string;
}

/**
 * Filesystem adapter for development and tests. Signed URLs point at the API
 * (`GET {publicBaseUrl}/{key}?exp=..&sig=..`) which calls `verifySignature` and streams the file.
 */
export class LocalObjectStorage implements ObjectStorage {
  readonly kind = 'local' as const;
  private readonly root: string;
  private readonly now: () => number;

  constructor(private readonly opts: LocalStorageOptions) {
    this.root = path.resolve(opts.rootDir);
    this.now = opts.now ?? Date.now;
  }

  private file(key: string): string {
    assertValidKey(key);
    const full = path.resolve(this.root, ...key.split('/'));
    if (!full.startsWith(this.root + path.sep)) throw new Error(`invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, body: Uint8Array, opts: PutOptions): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Write to a temp file then rename so readers never see a partial object.
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, file);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType: opts.contentType, metadata: opts.metadata ?? {} }));
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.file(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ObjectNotFoundError(key);
      throw err;
    }
  }

  async contentType(key: string): Promise<string> {
    try {
      const meta = JSON.parse(await readFile(`${this.file(key)}.meta.json`, 'utf8')) as { contentType?: string };
      return meta.contentType ?? 'application/octet-stream';
    } catch {
      return 'application/octet-stream';
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.file(key))).isFile();
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.file(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }

  async signedUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    assertValidKey(key);
    const exp = Math.floor(this.now() / 1000) + opts.expiresIn;
    const dn = opts.downloadName ?? '';
    const sig = this.sign(key, exp, dn);
    const qs = new URLSearchParams({ exp: String(exp), sig });
    if (dn) qs.set('dn', dn);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.opts.publicBaseUrl.replace(/\/$/, '')}/${encodedKey}?${qs.toString()}`;
  }

  /** Validate a signed request (key from the path, exp/sig/dn from the query). */
  verifySignature(key: string, exp: string | undefined, sig: string | undefined, dn?: string): VerifiedSignedRequest | null {
    if (!exp || !sig || !/^\d+$/.test(exp)) return null;
    try {
      assertValidKey(key);
    } catch {
      return null;
    }
    if (Number(exp) < Math.floor(this.now() / 1000)) return null;
    const expected = Buffer.from(this.sign(key, Number(exp), dn ?? ''));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return { key, downloadName: dn || undefined };
  }

  async ping(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  private sign(key: string, exp: number, downloadName: string): string {
    return createHmac('sha256', this.opts.signingSecret).update(`${key}\n${exp}\n${downloadName}`).digest('base64url');
  }
}
