/**
 * Object storage port. Adapters: S3/MinIO (production) and local filesystem (dev/tests).
 * Keys are POSIX-style relative paths, e.g. `photos/ab/abcdef.../original.jpg`.
 */
export interface PutOptions {
  contentType: string;
  /** Extra metadata stored with the object (S3 user metadata). */
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  /** Seconds until the URL expires. */
  expiresIn: number;
  /** Suggested download file name (Content-Disposition). */
  downloadName?: string;
}

export interface ObjectStorage {
  readonly kind: 'local' | 's3';
  put(key: string, body: Uint8Array, opts: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Time-limited URL a client can GET without other credentials. */
  signedUrl(key: string, opts: SignedUrlOptions): Promise<string>;
  /** Readiness probe. */
  ping(): Promise<void>;
}

export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

/** Reject keys that could escape the bucket/root or are otherwise malformed. */
export function assertValidKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > 512 ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')
  ) {
    throw new Error(`invalid storage key: ${JSON.stringify(key)}`);
  }
}
