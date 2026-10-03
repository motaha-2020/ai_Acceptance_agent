import { Inject, Injectable } from '@nestjs/common';
import { Prisma, UNIQUE_VIOLATION, type AppRelease, type PrismaClient } from '@acceptance/db';
import type {
  AppReleaseDto,
  CreateAppReleaseRequest,
  LatestReleaseQuery,
  ListAppReleasesQuery,
  UpdateAppReleaseRequest,
} from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import type { AuthContext } from '../auth/auth.types.js';
import type { AppConfig } from '../config/config.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { CONFIG, PRISMA, STORAGE } from '../core/tokens.js';

/**
 * Native (APK) releases. The APK itself is uploaded to object storage by infra/scripts/build-apk.sh;
 * this service registers it, decides what "latest" is and hands out short-lived download links.
 */
@Injectable()
export class AppReleasesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Newest published release of a channel (highest versionCode), or null. */
  async latest(q: LatestReleaseQuery): Promise<AppReleaseDto | null> {
    const row = await this.findLatest(q.channel, q.platform);
    return row ? this.present(row) : null;
  }

  async list(q: ListAppReleasesQuery): Promise<AppReleaseDto[]> {
    const rows = await this.prisma.appRelease.findMany({
      where: { channel: q.channel, platform: q.platform },
      orderBy: [{ channel: 'asc' }, { versionCode: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.present(r));
  }

  async create(auth: AuthContext, input: CreateAppReleaseRequest): Promise<AppReleaseDto> {
    if (!(await this.storage.exists(input.apkKey))) {
      throw badRequest('APK_NOT_FOUND', `No object at ${input.apkKey}; upload the APK before registering it`);
    }
    const highest = await this.prisma.appRelease.findFirst({
      where: { channel: input.channel, platform: input.platform },
      orderBy: { versionCode: 'desc' },
    });
    if (highest && input.versionCode <= highest.versionCode) {
      throw conflict('VERSION_CODE_NOT_INCREASING', `versionCode must be greater than ${highest.versionCode}`, { current: highest.versionCode });
    }
    const latest = await this.findLatest(input.channel, input.platform);
    const minCode = input.minSupportedVersionCode ?? latest?.minSupportedVersionCode ?? input.versionCode;
    if (minCode > input.versionCode) throw badRequest('INVALID_MIN_SUPPORTED', 'minSupportedVersionCode cannot exceed versionCode');
    try {
      const row = await this.prisma.appRelease.create({
        data: {
          platform: input.platform,
          channel: input.channel,
          version: input.version,
          versionCode: input.versionCode,
          runtimeVersion: input.runtimeVersion,
          apkKey: input.apkKey,
          apkSha256: input.apkSha256,
          apkSizeBytes: input.apkSizeBytes,
          notes: input.notes ?? null,
          minSupportedVersionCode: minCode,
          minSupported: await this.versionNameFor(input.channel, input.platform, minCode, input),
          isCritical: input.isCritical,
          publishedAt: input.publish ? new Date() : null,
          createdById: auth.user.id,
        },
      });
      return this.present(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        throw conflict('RELEASE_EXISTS', `Version ${input.version} already exists on ${input.channel}`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateAppReleaseRequest): Promise<AppReleaseDto> {
    const row = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!row) throw notFound('AppRelease', id);
    const minCode = input.minSupportedVersionCode;
    if (minCode !== undefined && minCode > row.versionCode) {
      throw badRequest('INVALID_MIN_SUPPORTED', 'minSupportedVersionCode cannot exceed versionCode');
    }
    const updated = await this.prisma.appRelease.update({
      where: { id },
      data: {
        notes: input.notes,
        isCritical: input.isCritical,
        ...(minCode !== undefined
          ? { minSupportedVersionCode: minCode, minSupported: await this.versionNameFor(row.channel, row.platform, minCode, row) }
          : {}),
      },
    });
    return this.present(updated);
  }

  /** Publishing makes the release a "latest" candidate; unpublishing a bad build rolls back to the previous one. */
  async setPublished(id: string, published: boolean): Promise<AppReleaseDto> {
    const row = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!row) throw notFound('AppRelease', id);
    const updated = await this.prisma.appRelease.update({
      where: { id },
      data: { publishedAt: published ? (row.publishedAt ?? new Date()) : null },
    });
    return this.present(updated);
  }

  /** Signed, short-lived URL for the APK of a published release (stable link -> redirect). */
  async downloadUrl(id: string): Promise<string> {
    const row = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!row || !row.publishedAt || !row.apkKey) throw notFound('AppRelease', id);
    return this.storage.signedUrl(row.apkKey, { expiresIn: this.config.APK_URL_TTL_SECONDS, downloadName: apkFileName(row) });
  }

  async latestDownloadUrl(q: LatestReleaseQuery): Promise<string> {
    const row = await this.findLatest(q.channel, q.platform);
    if (!row) throw notFound('AppRelease');
    return this.downloadUrl(row.id);
  }

  private findLatest(channel: LatestReleaseQuery['channel'], platform: string): Promise<AppRelease | null> {
    return this.prisma.appRelease.findFirst({
      where: { channel, platform, publishedAt: { not: null }, apkKey: { not: null } },
      orderBy: { versionCode: 'desc' },
    });
  }

  private async versionNameFor(
    channel: AppRelease['channel'],
    platform: string,
    versionCode: number,
    self: { versionCode: number; version: string },
  ): Promise<string> {
    if (versionCode === self.versionCode) return self.version;
    const match = await this.prisma.appRelease.findFirst({ where: { channel, platform, versionCode } });
    return match?.version ?? `build ${versionCode}`;
  }

  present(r: AppRelease): AppReleaseDto {
    const base = this.config.PUBLIC_BASE_URL.replace(/\/$/, '');
    return {
      id: r.id,
      platform: 'android',
      channel: r.channel,
      version: r.version,
      versionCode: r.versionCode,
      runtimeVersion: r.runtimeVersion,
      notes: r.notes,
      changelog: r.notes,
      sizeBytes: r.apkSizeBytes,
      sha256: r.apkSha256,
      downloadUrl: r.apkKey && r.publishedAt ? `${base}/api/v1/app/releases/${r.id}/download` : null,
      minSupportedVersion: r.minSupported,
      minSupportedVersionCode: r.minSupportedVersionCode,
      isCritical: r.isCritical,
      publishedAt: r.publishedAt?.toISOString() ?? null,
    };
  }
}

export function apkFileName(r: Pick<AppRelease, 'version' | 'versionCode' | 'channel'>): string {
  const suffix = r.channel === 'production' ? '' : `-${r.channel}`;
  return `acceptance-field-${r.version}-${r.versionCode}${suffix}.apk`;
}
