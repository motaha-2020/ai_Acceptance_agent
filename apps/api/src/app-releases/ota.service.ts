import { randomUUID, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { Prisma, type OtaChannelHead, type OtaUpdate, type PrismaClient } from '@acceptance/db';
import {
  ReleaseChannel,
  type CreateOtaUpdateRequest,
  type ListOtaUpdatesQuery,
  type OtaAssetInput,
  type OtaRollbackRequest,
} from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import type { AuthContext } from '../auth/auth.types.js';
import type { AppConfig } from '../config/config.js';
import { badRequest, DomainError, notFound } from '../core/errors.js';
import { CONFIG, LOGGER, PRISMA, STORAGE } from '../core/tokens.js';
import {
  buildManifest,
  buildUpdateParts,
  loadSigningKey,
  newBoundary,
  rollBackToEmbeddedDirective,
  serializeMultipart,
  type OtaUpdateRecord,
  type StoredOtaAsset,
} from './ota-protocol.js';

export interface ManifestRequest {
  protocolVersion: number;
  platform: string;
  runtimeVersion: string;
  channel: string;
  /** Client sent `expo-expect-signature` (it has an embedded code-signing certificate). */
  expectsSignature: boolean;
}

export type ManifestResponse =
  | { kind: 'none' }
  | { kind: 'multipart'; body: Buffer; contentType: string; updateId?: string };

export interface OtaUpdateDto {
  id: string;
  channel: string;
  platform: string;
  runtimeVersion: string;
  message: string | null;
  isCritical: boolean;
  assetCount: number;
  gitCommit: string | null;
  createdAt: string;
  isHead: boolean;
}

/**
 * Self-hosted expo-updates server: stores published updates and serves signed manifests.
 * Rollback never mutates updates; it moves the channel head (or rolls devices back to the
 * bundle embedded in their APK).
 */
@Injectable()
export class OtaService {
  private readonly key: KeyObject | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.key = null;
    if (config.OTA_PRIVATE_KEY_PATH) {
      // Fail fast: a configured but unreadable key would silently stop all OTA updates.
      this.key = loadSigningKey(readFileSync(config.OTA_PRIVATE_KEY_PATH, 'utf8'));
    } else if (config.NODE_ENV === 'production') {
      logger.warn('OTA_PRIVATE_KEY_PATH is not set: OTA manifests cannot be signed, devices will reject updates');
    }
  }

  get signingEnabled(): boolean {
    return this.key !== null;
  }

  async manifest(req: ManifestRequest): Promise<ManifestResponse> {
    if (req.protocolVersion !== 1) throw badRequest('UNSUPPORTED_PROTOCOL', 'Only expo-updates protocol version 1 is supported');
    if (req.platform !== 'android') throw badRequest('UNSUPPORTED_PLATFORM', `Platform ${req.platform} is not served`);
    const channel = ReleaseChannel.safeParse(req.channel);
    if (!channel.success) throw badRequest('UNKNOWN_CHANNEL', `Unknown channel ${req.channel}`);
    if (!req.runtimeVersion) throw badRequest('MISSING_RUNTIME_VERSION', 'expo-runtime-version header is required');
    if (req.expectsSignature && !this.key) {
      throw new DomainError(503, 'OTA_SIGNING_NOT_CONFIGURED', 'The update server has no signing key');
    }

    const head = await this.prisma.otaChannelHead.findUnique({
      where: { channel_platform_runtimeVersion: { channel: channel.data, platform: req.platform, runtimeVersion: req.runtimeVersion } },
      include: { update: true },
    });
    if (!head) return { kind: 'none' };

    const boundary = newBoundary();
    const contentType = `multipart/mixed; boundary=${boundary}`;
    if (head.rollBackToEmbedded) {
      const parts = buildUpdateParts({ kind: 'directive', payload: rollBackToEmbeddedDirective(head.updatedAt), key: this.key, keyId: this.config.OTA_KEY_ID });
      return { kind: 'multipart', body: serializeMultipart(parts, boundary), contentType };
    }
    if (!head.update) return { kind: 'none' };

    const manifest = await buildManifest(toRecord(head.update), (storageKey) =>
      this.storage.signedUrl(storageKey, { expiresIn: this.config.OTA_ASSET_URL_TTL_SECONDS }),
    );
    const parts = buildUpdateParts({ kind: 'manifest', payload: manifest, key: this.key, keyId: this.config.OTA_KEY_ID });
    return { kind: 'multipart', body: serializeMultipart(parts, boundary), contentType, updateId: head.update.id };
  }

  async create(auth: AuthContext, input: CreateOtaUpdateRequest): Promise<OtaUpdateDto> {
    const all = [input.launchAsset, ...input.assets];
    const missing: string[] = [];
    for (const a of all) if (!(await this.storage.exists(a.storageKey))) missing.push(a.storageKey);
    if (missing.length) throw badRequest('ASSETS_NOT_FOUND', 'Upload every asset before registering the update', { missing: missing.slice(0, 20) });

    const id = randomUUID();
    const data: Prisma.OtaUpdateUncheckedCreateInput = {
      id,
      channel: input.channel,
      platform: input.platform,
      runtimeVersion: input.runtimeVersion,
      message: input.message ?? null,
      isCritical: input.isCritical,
      launchAsset: toStored(input.launchAsset) as unknown as Prisma.InputJsonValue,
      assets: input.assets.map(toStored) as unknown as Prisma.InputJsonValue,
      expoClient: input.expoClient ? (input.expoClient as Prisma.InputJsonValue) : Prisma.JsonNull,
      gitCommit: input.gitCommit ?? null,
      createdById: auth.user.id,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.otaUpdate.create({ data });
      if (input.publish) await this.moveHead(tx, auth, created.channel, created.platform, created.runtimeVersion, created.id, false);
      return created;
    });
    this.logger.info({ updateId: id, channel: input.channel, runtimeVersion: input.runtimeVersion, publish: input.publish }, 'OTA update registered');
    return this.present(row, input.publish ? id : null);
  }

  /** Point a channel at an earlier update (or at the APK's embedded bundle). */
  async rollback(auth: AuthContext, input: OtaRollbackRequest): Promise<{ channel: string; runtimeVersion: string; updateId: string | null; rollBackToEmbedded: boolean }> {
    if (input.updateId) {
      const target = await this.prisma.otaUpdate.findUnique({ where: { id: input.updateId } });
      if (!target) throw notFound('OtaUpdate', input.updateId);
      if (target.channel !== input.channel || target.platform !== input.platform || target.runtimeVersion !== input.runtimeVersion) {
        throw badRequest('UPDATE_MISMATCH', 'The update belongs to another channel, platform or runtime version');
      }
    }
    const head = await this.prisma.$transaction((tx) =>
      this.moveHead(tx, auth, input.channel, input.platform, input.runtimeVersion, input.updateId ?? null, input.toEmbedded),
    );
    return { channel: head.channel, runtimeVersion: head.runtimeVersion, updateId: head.updateId, rollBackToEmbedded: head.rollBackToEmbedded };
  }

  /** Newest first; `isHead` marks what a channel currently serves. */
  async list(q: ListOtaUpdatesQuery): Promise<OtaUpdateDto[]> {
    const [rows, heads] = await Promise.all([
      this.prisma.otaUpdate.findMany({
        where: { channel: q.channel, runtimeVersion: q.runtimeVersion },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.otaChannelHead.findMany(),
    ]);
    const headIds = new Set(heads.map((h) => h.updateId).filter((v): v is string => Boolean(v)));
    return rows.map((r) => this.present(r, headIds.has(r.id) ? r.id : null));
  }

  heads(): Promise<OtaChannelHead[]> {
    return this.prisma.otaChannelHead.findMany({ orderBy: [{ channel: 'asc' }, { runtimeVersion: 'desc' }] });
  }

  private moveHead(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    channel: OtaUpdate['channel'],
    platform: string,
    runtimeVersion: string,
    updateId: string | null,
    toEmbedded: boolean,
  ): Promise<OtaChannelHead> {
    const data = { updateId, rollBackToEmbedded: toEmbedded, updatedById: auth.user.id };
    return tx.otaChannelHead.upsert({
      where: { channel_platform_runtimeVersion: { channel, platform, runtimeVersion } },
      create: { channel, platform, runtimeVersion, ...data },
      update: data,
    });
  }

  private present(r: OtaUpdate, headId: string | null): OtaUpdateDto {
    return {
      id: r.id,
      channel: r.channel,
      platform: r.platform,
      runtimeVersion: r.runtimeVersion,
      message: r.message,
      isCritical: r.isCritical,
      assetCount: Array.isArray(r.assets) ? r.assets.length + 1 : 1,
      gitCommit: r.gitCommit,
      createdAt: r.createdAt.toISOString(),
      isHead: headId === r.id,
    };
  }
}

function toStored(a: OtaAssetInput): StoredOtaAsset {
  return { key: a.key, hash: a.hash, contentType: a.contentType, ...(a.fileExtension ? { fileExtension: a.fileExtension } : {}), storageKey: a.storageKey };
}

function toRecord(u: OtaUpdate): OtaUpdateRecord {
  return {
    id: u.id,
    createdAt: u.createdAt,
    runtimeVersion: u.runtimeVersion,
    channel: u.channel,
    message: u.message,
    isCritical: u.isCritical,
    launchAsset: u.launchAsset as unknown as StoredOtaAsset,
    assets: (u.assets ?? []) as unknown as StoredOtaAsset[],
    expoClient: (u.expoClient as Record<string, unknown> | null) ?? null,
  };
}
