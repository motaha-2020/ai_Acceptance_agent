import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertValidKey, ObjectNotFoundError, type ObjectStorage, type PutOptions, type SignedUrlOptions } from './port.js';

export interface S3StorageOptions {
  endpoint: string;
  /** Endpoint clients use to download (signed URLs); defaults to `endpoint`. */
  publicEndpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** MinIO needs path-style addressing. */
  forcePathStyle?: boolean;
}

/** S3 / MinIO adapter (production). */
export class S3ObjectStorage implements ObjectStorage {
  readonly kind = 's3' as const;
  private readonly client: S3Client;
  private readonly signer: S3Client;

  constructor(private readonly opts: S3StorageOptions) {
    const base = {
      region: opts.region ?? 'us-east-1',
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      forcePathStyle: opts.forcePathStyle ?? true,
    };
    this.client = new S3Client({ ...base, endpoint: opts.endpoint });
    // Signed URLs must carry the host the client will actually reach (e.g. behind Caddy).
    this.signer = new S3Client({ ...base, endpoint: opts.publicEndpoint ?? opts.endpoint });
  }

  async put(key: string, body: Uint8Array, opts: PutOptions): Promise<void> {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: opts.contentType, Metadata: opts.metadata }),
    );
  }

  async get(key: string): Promise<Buffer> {
    assertValidKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      if (!res.Body) throw new ObjectNotFoundError(key);
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError(key);
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertValidKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async signedUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    assertValidKey(key);
    const cmd = new GetObjectCommand({
      Bucket: this.opts.bucket,
      Key: key,
      ResponseContentDisposition: opts.downloadName ? `attachment; filename="${opts.downloadName.replace(/"/g, '')}"` : undefined,
    });
    return getSignedUrl(this.signer, cmd, { expiresIn: opts.expiresIn });
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.opts.bucket }));
  }

  /** Create the bucket if it does not exist (used at startup in dev/compose). */
  async ensureBucket(): Promise<void> {
    try {
      await this.ping();
    } catch (err) {
      if (!isNotFound(err)) throw err;
      await this.client.send(new CreateBucketCommand({ Bucket: this.opts.bucket }));
    }
  }
}

function isNotFound(err: unknown): boolean {
  if (err instanceof ObjectNotFoundError) return true;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.name === 'NoSuchBucket' || e?.$metadata?.httpStatusCode === 404;
}
