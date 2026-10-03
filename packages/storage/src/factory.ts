import { LocalObjectStorage } from './local.js';
import type { ObjectStorage } from './port.js';
import { S3ObjectStorage } from './s3.js';

export interface StorageEnv {
  STORAGE_DRIVER: 'local' | 's3';
  STORAGE_LOCAL_DIR?: string;
  /** Base URL of the API's signed-file route (local driver). */
  STORAGE_PUBLIC_BASE_URL?: string;
  STORAGE_SIGNING_SECRET?: string;
  S3_ENDPOINT?: string;
  S3_PUBLIC_ENDPOINT?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_BUCKET?: string;
}

function required(env: StorageEnv, key: keyof StorageEnv): string {
  const v = env[key];
  if (!v) throw new Error(`${key} is required for STORAGE_DRIVER=${env.STORAGE_DRIVER}`);
  return v;
}

export function createObjectStorage(env: StorageEnv): ObjectStorage {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3ObjectStorage({
      endpoint: required(env, 'S3_ENDPOINT'),
      publicEndpoint: env.S3_PUBLIC_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: required(env, 'S3_ACCESS_KEY'),
      secretAccessKey: required(env, 'S3_SECRET_KEY'),
      bucket: required(env, 'S3_BUCKET'),
    });
  }
  return new LocalObjectStorage({
    rootDir: required(env, 'STORAGE_LOCAL_DIR'),
    publicBaseUrl: required(env, 'STORAGE_PUBLIC_BASE_URL'),
    signingSecret: required(env, 'STORAGE_SIGNING_SECRET'),
  });
}
