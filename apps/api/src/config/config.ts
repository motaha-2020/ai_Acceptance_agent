import path from 'node:path';
import { z } from 'zod';
import { WorkerEnv } from '@acceptance/worker';

const bool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

/** Every setting the API reads, validated once at boot (fail fast with a readable message). */
export const ApiEnv = WorkerEnv.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Public URL of this API (used to build signed URLs for local storage). */
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  SWAGGER_ENABLED: bool('true'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  QUEUE_PREFIX: z.string().optional(),
  /** auto = run the analysis worker inside the API when no REDIS_URL is configured. */
  EMBEDDED_WORKER: z.enum(['auto', 'true', 'false']).default('auto'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('acceptance-api'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(180).default(30),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),

  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).default(25 * 1024 * 1024),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(7 * 24 * 3600).default(900),

  /** PEM private key that signs OTA manifests (expo-updates code signing). Unset = unsigned (dev only). */
  OTA_PRIVATE_KEY_PATH: z.string().optional(),
  /** keyid the app's embedded certificate metadata expects. */
  OTA_KEY_ID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).default('main'),
  /** Lifetime of the signed asset URLs inside a manifest (the device downloads right after the check). */
  OTA_ASSET_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(7 * 24 * 3600).default(3600),
  /** Lifetime of the signed APK URL the stable download link redirects to. */
  APK_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(24 * 3600).default(900),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.data/storage'),
  STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),
  STORAGE_SIGNING_SECRET: z.string().min(32, 'STORAGE_SIGNING_SECRET must be at least 32 characters').optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER === 'local' && !env.STORAGE_SIGNING_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['STORAGE_SIGNING_SECRET'], message: 'required when STORAGE_DRIVER=local' });
  }
  if (env.STORAGE_DRIVER === 's3') {
    for (const key of ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=s3' });
    }
  }
  if (env.NODE_ENV === 'production' && env.AI_PROVIDER === 'fake') {
    ctx.addIssue({ code: 'custom', path: ['AI_PROVIDER'], message: 'the fake provider is not allowed in production' });
  }
});

export type AppConfig = z.infer<typeof ApiEnv> & {
  storagePublicBaseUrl: string;
  storageLocalDir: string;
  embeddedWorker: boolean;
};

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = ApiEnv.safeParse(env);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const c = parsed.data;
  return {
    ...c,
    storagePublicBaseUrl: c.STORAGE_PUBLIC_BASE_URL ?? `${c.PUBLIC_BASE_URL.replace(/\/$/, '')}/files`,
    storageLocalDir: path.resolve(c.STORAGE_LOCAL_DIR),
    embeddedWorker: c.EMBEDDED_WORKER === 'auto' ? !c.REDIS_URL : c.EMBEDDED_WORKER === 'true',
  };
}
