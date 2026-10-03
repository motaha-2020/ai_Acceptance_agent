import { Controller, Delete, Get, HttpCode, Inject, Injectable, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Prisma, PrismaClient } from '@acceptance/db';
import { CreateSiteRequest, ListSitesQuery, UpdateSiteRequest } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import { CheckPolicy } from '../auth/decorators.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { PRISMA } from '../core/tokens.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';

const siteInclude = {
  project: { select: { id: true, code: true, name: true } },
  devices: { orderBy: { createdAt: 'asc' } },
  _count: { select: { visits: true, photos: true } },
} satisfies Prisma.SiteInclude;

@Injectable()
export class SitesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(q: ListSitesQuery) {
    const where: Prisma.SiteWhereInput = {
      archivedAt: q.includeArchived ? undefined : null,
      projectId: q.projectId,
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }, { exchange: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.site.findMany({ where, orderBy: { name: 'asc' }, include: siteInclude, omit: { meta: true }, ...pageArgs(q) }),
      this.prisma.site.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(id: string) {
    const site = await this.prisma.site.findUnique({ where: { id }, include: siteInclude });
    if (!site) throw notFound('Site', id);
    return site;
  }

  async create(input: CreateSiteRequest) {
    const project = await this.prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project || project.archivedAt) throw badRequest('INVALID_PROJECT', 'Project does not exist or is archived');
    const { gps, ...rest } = input;
    return this.prisma.site.create({ data: { ...rest, gpsLat: gps?.lat, gpsLng: gps?.lng }, include: siteInclude });
  }

  async update(id: string, input: UpdateSiteRequest) {
    await this.get(id);
    const { gps, ...rest } = input;
    return this.prisma.site.update({
      where: { id },
      data: { ...rest, ...(gps ? { gpsLat: gps.lat, gpsLng: gps.lng } : {}) },
      include: siteInclude,
    });
  }

  /** Soft delete; refused while visits are still open. */
  async archive(id: string) {
    await this.get(id);
    const open = await this.prisma.visit.count({ where: { siteId: id, status: { in: ['planned', 'in_progress', 'submitted'] } } });
    if (open > 0) throw conflict('HAS_OPEN_VISITS', `Site has ${open} open visit(s)`);
    return this.prisma.site.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}

@ApiTags('sites')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(@Inject(SitesService) private readonly sites: SitesService) {}

  @Get()
  @CheckPolicy('read', 'Site')
  @ApiZodQuery(ListSitesQuery)
  list(@ZQuery(ListSitesQuery) q: ListSitesQuery) {
    return this.sites.list(q);
  }

  @Get(':id')
  @CheckPolicy('read', 'Site')
  @ApiIdParam()
  get(@IdParam() id: string) {
    return this.sites.get(id);
  }

  @Post()
  @CheckPolicy('create', 'Site')
  @Audited('Site')
  @ApiZodBody(CreateSiteRequest)
  create(@ZBody(CreateSiteRequest) body: CreateSiteRequest) {
    return this.sites.create(body);
  }

  @Patch(':id')
  @CheckPolicy('update', 'Site')
  @Audited('Site')
  @ApiIdParam()
  @ApiZodBody(UpdateSiteRequest)
  update(@IdParam() id: string, @ZBody(UpdateSiteRequest) body: UpdateSiteRequest) {
    return this.sites.update(id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @CheckPolicy('delete', 'Site')
  @Audited('Site')
  @ApiOperation({ summary: 'Archive (soft delete) a site without open visits' })
  @ApiIdParam()
  archive(@IdParam() id: string) {
    return this.sites.archive(id);
  }
}
