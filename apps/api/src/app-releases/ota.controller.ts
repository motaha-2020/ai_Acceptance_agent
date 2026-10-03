import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreateOtaUpdateRequest, ListOtaUpdatesQuery, OtaRollbackRequest } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy, Public } from '../auth/decorators.js';
import { ApiZodBody, ApiZodQuery, ZBody, ZQuery } from '../core/zod.js';
import { OtaService, type ManifestRequest } from './ota.service.js';

/**
 * Self-hosted expo-updates server (protocol v1).
 * Devices call GET /api/v1/updates/manifest on launch/resume with headers
 * `expo-protocol-version`, `expo-platform`, `expo-runtime-version`, `expo-channel-name`
 * (query parameters `platform`, `runtimeVersion`, `channel` are accepted for debugging).
 */
@ApiTags('ota updates')
@Controller('updates')
export class OtaController {
  constructor(@Inject(OtaService) private readonly ota: OtaService) {}

  @Public()
  @Get('manifest')
  @ApiOperation({ summary: 'Public: expo-updates manifest (multipart/mixed, code-signed) or 204 when there is no update' })
  async manifest(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const result = await this.ota.manifest(readManifestRequest(req));
    void reply
      .header('expo-protocol-version', '1')
      .header('expo-sfv-version', '0')
      .header('cache-control', 'private, max-age=0');
    if (result.kind === 'none') {
      await reply.status(204).send();
      return;
    }
    await reply.status(200).header('content-type', result.contentType).send(result.body);
  }

  @Get()
  @ApiBearerAuth()
  @CheckPolicy('read', 'AppRelease')
  @ApiOperation({ summary: 'Published OTA updates, newest first (isHead = currently served)' })
  @ApiZodQuery(ListOtaUpdatesQuery)
  list(@ZQuery(ListOtaUpdatesQuery) q: ListOtaUpdatesQuery) {
    return this.ota.list(q);
  }

  @Get('heads')
  @ApiBearerAuth()
  @CheckPolicy('read', 'AppRelease')
  @ApiOperation({ summary: 'What each channel/runtimeVersion serves right now' })
  heads() {
    return this.ota.heads();
  }

  @Post()
  @ApiBearerAuth()
  @CheckPolicy('manage', 'AppRelease')
  @Audited('OtaUpdate')
  @ApiOperation({ summary: 'Admin: register an exported update whose files are already in object storage (infra/scripts/publish-ota.sh)' })
  @ApiZodBody(CreateOtaUpdateRequest)
  create(@Auth() auth: AuthContext, @ZBody(CreateOtaUpdateRequest) body: CreateOtaUpdateRequest) {
    return this.ota.create(auth, body);
  }

  @Post('rollback')
  @HttpCode(200)
  @ApiBearerAuth()
  @CheckPolicy('manage', 'AppRelease')
  @Audited('OtaUpdate')
  @ApiOperation({ summary: 'Admin: point a channel at an earlier update, or roll devices back to the bundle embedded in the APK' })
  @ApiZodBody(OtaRollbackRequest)
  rollback(@Auth() auth: AuthContext, @ZBody(OtaRollbackRequest) body: OtaRollbackRequest) {
    return this.ota.rollback(auth, body);
  }

  @Get('signing')
  @ApiExcludeEndpoint()
  @ApiBearerAuth()
  @CheckPolicy('read', 'AppRelease')
  signing() {
    return { enabled: this.ota.signingEnabled };
  }
}

function header(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name];
  return typeof v === 'string' ? v.trim() : Array.isArray(v) ? v[0]?.trim() : undefined;
}

export function readManifestRequest(req: FastifyRequest): ManifestRequest {
  const q = (req.query ?? {}) as Record<string, string | undefined>;
  const protocol = header(req, 'expo-protocol-version') ?? q['protocolVersion'] ?? '1';
  return {
    protocolVersion: Number.parseInt(protocol, 10),
    platform: (header(req, 'expo-platform') ?? q['platform'] ?? '').toLowerCase(),
    runtimeVersion: header(req, 'expo-runtime-version') ?? q['runtimeVersion'] ?? '',
    channel: header(req, 'expo-channel-name') ?? q['channel'] ?? 'production',
    expectsSignature: Boolean(header(req, 'expo-expect-signature')),
  };
}
