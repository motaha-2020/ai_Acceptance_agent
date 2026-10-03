import { Controller, Delete, Get, HttpCode, Inject, Injectable, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Prisma, PrismaClient } from '@acceptance/db';
import { CreateProjectRequest, ListProjectsQuery, UpdateProjectRequest } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import { CheckPolicy } from '../auth/decorators.js';
import { conflict, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { PRISMA } from '../core/tokens.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';

@Injectable()
export class ProjectsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(q: ListProjectsQuery) {
    const where: Prisma.ProjectWhereInput = {
      archivedAt: q.includeArchived ? undefined : null,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({ where, orderBy: { name: 'asc' }, include: { _count: { select: { sites: true } } }, ...pageArgs(q) }),
      this.prisma.project.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(id: string) {
    const p = await this.prisma.project.findUnique({ where: { id }, include: { _count: { select: { sites: true } } } });
    if (!p) throw notFound('Project', id);
    return p;
  }

  create(input: CreateProjectRequest) {
    return this.prisma.project.create({ data: input });
  }

  async update(id: string, input: UpdateProjectRequest) {
    await this.get(id);
    return this.prisma.project.update({ where: { id }, data: input });
  }

  /** Soft delete; refused while active sites exist. */
  async archive(id: string) {
    await this.get(id);
    const activeSites = await this.prisma.site.count({ where: { projectId: id, archivedAt: null } });
    if (activeSites > 0) throw conflict('HAS_ACTIVE_SITES', `Project has ${activeSites} active site(s); archive them first`);
    return this.prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  @CheckPolicy('read', 'Project')
  @ApiZodQuery(ListProjectsQuery)
  list(@ZQuery(ListProjectsQuery) q: ListProjectsQuery) {
    return this.projects.list(q);
  }

  @Get(':id')
  @CheckPolicy('read', 'Project')
  @ApiIdParam()
  get(@IdParam() id: string) {
    return this.projects.get(id);
  }

  @Post()
  @CheckPolicy('create', 'Project')
  @Audited('Project')
  @ApiZodBody(CreateProjectRequest)
  create(@ZBody(CreateProjectRequest) body: CreateProjectRequest) {
    return this.projects.create(body);
  }

  @Patch(':id')
  @CheckPolicy('update', 'Project')
  @Audited('Project')
  @ApiIdParam()
  @ApiZodBody(UpdateProjectRequest)
  update(@IdParam() id: string, @ZBody(UpdateProjectRequest) body: UpdateProjectRequest) {
    return this.projects.update(id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @CheckPolicy('delete', 'Project')
  @Audited('Project')
  @ApiOperation({ summary: 'Archive (soft delete) a project without active sites' })
  @ApiIdParam()
  archive(@IdParam() id: string) {
    return this.projects.archive(id);
  }
}
