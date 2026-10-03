import { Controller, Delete, Get, HttpCode, Inject, Injectable, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma, PrismaClient } from '@acceptance/db';
import { CreateDeviceRequest, ListDevicesQuery, UpdateDeviceRequest } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import { CheckPolicy } from '../auth/decorators.js';
import { badRequest, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { PRISMA } from '../core/tokens.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';

@Injectable()
export class DevicesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(q: ListDevicesQuery) {
    const where: Prisma.DeviceWhereInput = {
      siteId: q.siteId,
      ...(q.q
        ? { OR: [{ hostname: { contains: q.q, mode: 'insensitive' } }, { serial: { contains: q.q, mode: 'insensitive' } }, { model: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({ where, orderBy: [{ siteId: 'asc' }, { createdAt: 'asc' }], include: { site: { select: { id: true, code: true, name: true } } }, ...pageArgs(q) }),
      this.prisma.device.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(id: string) {
    const d = await this.prisma.device.findUnique({ where: { id }, include: { site: { select: { id: true, code: true, name: true } } } });
    if (!d) throw notFound('Device', id);
    return d;
  }

  async create(input: CreateDeviceRequest) {
    const site = await this.prisma.site.findUnique({ where: { id: input.siteId } });
    if (!site || site.archivedAt) throw badRequest('INVALID_SITE', 'Site does not exist or is archived');
    return this.prisma.device.create({ data: input });
  }

  async update(id: string, input: UpdateDeviceRequest) {
    await this.get(id);
    return this.prisma.device.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.device.delete({ where: { id } });
  }
}

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devices: DevicesService) {}

  @Get()
  @CheckPolicy('read', 'Device')
  @ApiZodQuery(ListDevicesQuery)
  list(@ZQuery(ListDevicesQuery) q: ListDevicesQuery) {
    return this.devices.list(q);
  }

  @Get(':id')
  @CheckPolicy('read', 'Device')
  @ApiIdParam()
  get(@IdParam() id: string) {
    return this.devices.get(id);
  }

  @Post()
  @CheckPolicy('create', 'Device')
  @Audited('Device')
  @ApiZodBody(CreateDeviceRequest)
  create(@ZBody(CreateDeviceRequest) body: CreateDeviceRequest) {
    return this.devices.create(body);
  }

  @Patch(':id')
  @CheckPolicy('update', 'Device')
  @Audited('Device')
  @ApiIdParam()
  @ApiZodBody(UpdateDeviceRequest)
  update(@IdParam() id: string, @ZBody(UpdateDeviceRequest) body: UpdateDeviceRequest) {
    return this.devices.update(id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @CheckPolicy('delete', 'Device')
  @Audited('Device')
  @ApiIdParam()
  remove(@IdParam() id: string) {
    return this.devices.remove(id);
  }
}
