import { z } from 'zod';

/**
 * Mobile app distribution contracts: native APK releases (sideloaded from the web portal) and
 * over-the-air (OTA) JS updates served by the self-hosted expo-updates server in the API.
 * Shared by the API (validation), the mobile app (forced-update gate) and the web `/app` page.
 */

export const ReleaseChannel = z.enum(['production', 'staging']);
export type ReleaseChannel = z.infer<typeof ReleaseChannel>;

export const AppPlatform = z.enum(['android']);
export type AppPlatform = z.infer<typeof AppPlatform>;

/** Semver-like app version shown to users, e.g. 1.2.0. */
export const AppVersion = z.string().regex(/^\d+\.\d+\.\d+$/, 'version must look like 1.2.3');
/** expo-updates runtime version; native-compatibility key between an APK and OTA bundles. */
export const RuntimeVersion = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
/** Storage keys written by the release scripts; never user-chosen paths. */
const ReleaseObjectKey = z.string().regex(/^(app-releases|ota)\/[A-Za-z0-9._\/-]{1,400}$/).refine((k) => !k.split('/').includes('..'));

export const LatestReleaseQuery = z.object({
  channel: ReleaseChannel.default('production'),
  platform: AppPlatform.default('android'),
});
export type LatestReleaseQuery = z.infer<typeof LatestReleaseQuery>;

/** Public DTO of a native release (`GET /api/v1/app/releases/latest`). */
export const AppReleaseDto = z.object({
  id: z.string(),
  platform: AppPlatform,
  channel: ReleaseChannel,
  version: z.string(),
  versionCode: z.number().int(),
  runtimeVersion: z.string(),
  notes: z.string().nullable(),
  /** Alias of `notes` for the web download page. */
  changelog: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  sha256: z.string().nullable(),
  /** Stable URL (redirects to a short-lived signed MinIO URL). */
  downloadUrl: z.string().nullable(),
  /** Oldest native build still allowed to use the API; older builds are blocked by the app. */
  minSupportedVersion: z.string(),
  minSupportedVersionCode: z.number().int(),
  isCritical: z.boolean(),
  publishedAt: z.string().nullable(),
});
export type AppReleaseDto = z.infer<typeof AppReleaseDto>;

/** Admin: register an APK that the build script already uploaded to object storage. */
export const CreateAppReleaseRequest = z.object({
  platform: AppPlatform.default('android'),
  channel: ReleaseChannel,
  version: AppVersion,
  versionCode: z.number().int().min(1).max(2_100_000_000),
  runtimeVersion: RuntimeVersion,
  apkKey: ReleaseObjectKey,
  apkSha256: Sha256Hex,
  apkSizeBytes: z.number().int().min(1).max(500 * 1024 * 1024),
  notes: z.string().trim().max(4000).optional(),
  /** Defaults to the previous release's minimum (or this versionCode when none exists). */
  minSupportedVersionCode: z.number().int().min(1).optional(),
  isCritical: z.boolean().default(false),
  publish: z.boolean().default(true),
});
export type CreateAppReleaseRequest = z.infer<typeof CreateAppReleaseRequest>;

export const UpdateAppReleaseRequest = z
  .object({
    notes: z.string().trim().max(4000).nullable(),
    minSupportedVersionCode: z.number().int().min(1),
    isCritical: z.boolean(),
  })
  .partial();
export type UpdateAppReleaseRequest = z.infer<typeof UpdateAppReleaseRequest>;

export const ListAppReleasesQuery = z.object({
  channel: ReleaseChannel.optional(),
  platform: AppPlatform.optional(),
});
export type ListAppReleasesQuery = z.infer<typeof ListAppReleasesQuery>;

// ───────────────────────────── OTA updates (expo-updates protocol) ─────────────────────────────

/** One file of an exported update, already uploaded to object storage by publish-ota.sh. */
export const OtaAssetInput = z.object({
  /** expo-updates asset key (md5 of the file, as produced by `expo export`). */
  key: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  /** base64url(sha256(file)); the device verifies every download against it. */
  hash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  contentType: z.string().min(3).max(120),
  /** With leading dot, e.g. ".png". */
  fileExtension: z.string().regex(/^\.[A-Za-z0-9]{1,16}$/).optional(),
  storageKey: ReleaseObjectKey,
});
export type OtaAssetInput = z.infer<typeof OtaAssetInput>;

export const CreateOtaUpdateRequest = z.object({
  channel: ReleaseChannel,
  platform: AppPlatform.default('android'),
  runtimeVersion: RuntimeVersion,
  message: z.string().trim().max(2000).optional(),
  /** Critical updates are applied immediately by the app (reload) instead of on next start. */
  isCritical: z.boolean().default(false),
  launchAsset: OtaAssetInput,
  assets: z.array(OtaAssetInput.required({ fileExtension: true })).max(2000),
  /** Public app config (`expo config --type public`), served as manifest.extra.expoClient. */
  expoClient: z.record(z.unknown()).optional(),
  gitCommit: z.string().regex(/^[a-f0-9]{7,40}$/).optional(),
  /** Make this update the channel head right away (default). */
  publish: z.boolean().default(true),
});
export type CreateOtaUpdateRequest = z.infer<typeof CreateOtaUpdateRequest>;

/**
 * Admin rollback: point the channel head to an earlier update (`updateId`), or tell devices to
 * return to the update embedded in their APK (`toEmbedded`).
 */
export const OtaRollbackRequest = z
  .object({
    channel: ReleaseChannel,
    platform: AppPlatform.default('android'),
    runtimeVersion: RuntimeVersion,
    updateId: z.string().uuid().optional(),
    toEmbedded: z.boolean().default(false),
  })
  .refine((v) => v.toEmbedded !== Boolean(v.updateId), { message: 'give exactly one of updateId or toEmbedded=true' });
export type OtaRollbackRequest = z.infer<typeof OtaRollbackRequest>;

export const ListOtaUpdatesQuery = z.object({
  channel: ReleaseChannel.optional(),
  runtimeVersion: RuntimeVersion.optional(),
});
export type ListOtaUpdatesQuery = z.infer<typeof ListOtaUpdatesQuery>;

/** Numeric comparison of x.y.z versions (returns <0, 0, >0). */
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
