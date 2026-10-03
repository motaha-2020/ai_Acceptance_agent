import { Controller, Get, HttpCode, Inject, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import {
  CreateAppReleaseRequest,
  LatestReleaseQuery,
  ListAppReleasesQuery,
  UpdateAppReleaseRequest,
  type AppReleaseDto,
} from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy, Public } from '../auth/decorators.js';
import { notFound } from '../core/errors.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';
import { AppReleasesService } from './releases.service.js';

/**
 * Native app releases (APK sideloading from the web portal + forced-update policy).
 * Public, read-only: latest release info and the stable download link. Admin: register/publish.
 */
@ApiTags('app releases')
@Controller('app/releases')
export class AppReleasesController {
  constructor(@Inject(AppReleasesService) private readonly releases: AppReleasesService) {}

  @Public()
  @Get('latest')
  @ApiOperation({
    summary: 'Public: newest published APK of a channel (version, versionCode, runtimeVersion, notes, size, sha256, downloadUrl, minSupportedVersionCode)',
    description: '404 NOT_FOUND when the channel has no published release yet.',
  })
  @ApiZodQuery(LatestReleaseQuery)
  async latest(@ZQuery(LatestReleaseQuery) q: LatestReleaseQuery, @Res({ passthrough: true }) reply: FastifyReply): Promise<AppReleaseDto> {
    const r = await this.releases.latest(q);
    if (!r) throw notFound('AppRelease');
    void reply.header('cache-control', 'public, max-age=60');
    return r;
  }

  @Public()
  @Get('latest/download')
  @ApiOperation({ summary: 'Public: 302 to a short-lived signed URL of the newest APK of a channel' })
  @ApiZodQuery(LatestReleaseQuery)
  async latestDownload(@ZQuery(LatestReleaseQuery) q: LatestReleaseQuery, @Res() reply: FastifyReply): Promise<void> {
    await redirect(reply, await this.releases.latestDownloadUrl(q));
  }

  @Public()
  @Get(':id/download')
  @ApiOperation({ summary: 'Public: 302 to a short-lived signed URL of this release APK (stable link for QR codes)' })
  @ApiIdParam()
  async download(@IdParam() id: string, @Res() reply: FastifyReply): Promise<void> {
    await redirect(reply, await this.releases.downloadUrl(id));
  }

  @Get()
  @ApiBearerAuth()
  @CheckPolicy('read', 'AppRelease')
  @ApiOperation({ summary: 'All releases incl. unpublished (admin/pm)' })
  @ApiZodQuery(ListAppReleasesQuery)
  list(@ZQuery(ListAppReleasesQuery) q: ListAppReleasesQuery) {
    return this.releases.list(q);
  }

  @Post()
  @ApiBearerAuth()
  @CheckPolicy('manage', 'AppRelease')
  @Audited('AppRelease')
  @ApiOperation({ summary: 'Admin: register an APK already uploaded to object storage (used by infra/scripts/build-apk.sh)' })
  @ApiZodBody(CreateAppReleaseRequest)
  create(@Auth() auth: AuthContext, @ZBody(CreateAppReleaseRequest) body: CreateAppReleaseRequest) {
    return this.releases.create(auth, body);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @CheckPolicy('manage', 'AppRelease')
  @Audited('AppRelease')
  @ApiOperation({ summary: 'Admin: change notes, critical flag or minSupportedVersionCode (raising it forces older builds to update)' })
  @ApiIdParam()
  @ApiZodBody(UpdateAppReleaseRequest)
  update(@IdParam() id: string, @ZBody(UpdateAppReleaseRequest) body: UpdateAppReleaseRequest) {
    return this.releases.update(id, body);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiBearerAuth()
  @CheckPolicy('manage', 'AppRelease')
  @Audited('AppRelease')
  @ApiIdParam()
  publish(@IdParam() id: string) {
    return this.releases.setPublished(id, true);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @ApiBearerAuth()
  @CheckPolicy('manage', 'AppRelease')
  @Audited('AppRelease')
  @ApiOperation({ summary: 'Admin: withdraw a release; "latest" falls back to the previous published build' })
  @ApiIdParam()
  unpublish(@IdParam() id: string) {
    return this.releases.setPublished(id, false);
  }
}

/**
 * Compatibility alias for the web `/app` page, which was built against `/app-releases/latest`.
 * Same DTO as `/app/releases/latest`.
 */
@ApiTags('app releases')
@Controller('app-releases')
export class AppReleasesAliasController {
  constructor(@Inject(AppReleasesService) private readonly releases: AppReleasesService) {}

  @Public()
  @Get('latest')
  @ApiOperation({ summary: 'Public alias of GET /app/releases/latest' })
  @ApiZodQuery(LatestReleaseQuery)
  async latest(@ZQuery(LatestReleaseQuery) q: LatestReleaseQuery): Promise<AppReleaseDto> {
    const r = await this.releases.latest(q);
    if (!r) throw notFound('AppRelease');
    return r;
  }
}

async function redirect(reply: FastifyReply, url: string): Promise<void> {
  await reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').redirect(url, 302);
}
