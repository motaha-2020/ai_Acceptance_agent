import { Controller, Delete, Get, HttpCode, Inject, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssignTechniciansRequest, CreateVisitRequest, ListVisitsQuery, UpdateVisitRequest } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy } from '../auth/decorators.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';
import { VisitsService } from './visits.service.js';

@ApiTags('visits')
@ApiBearerAuth()
@Controller('visits')
export class VisitsController {
  constructor(@Inject(VisitsService) private readonly visits: VisitsService) {}

  @Get()
  @CheckPolicy('read', 'Visit')
  @ApiOperation({ summary: 'List visits (technicians see only visits they are assigned to)' })
  @ApiZodQuery(ListVisitsQuery)
  list(@Auth() auth: AuthContext, @ZQuery(ListVisitsQuery) q: ListVisitsQuery) {
    return this.visits.list(auth, q);
  }

  @Get(':id')
  @CheckPolicy('read', 'Visit')
  @ApiIdParam()
  get(@Auth() auth: AuthContext, @IdParam() id: string) {
    return this.visits.get(auth, id);
  }

  @Post()
  @CheckPolicy('create', 'Visit')
  @Audited('Visit')
  @ApiZodBody(CreateVisitRequest)
  create(@Auth() auth: AuthContext, @ZBody(CreateVisitRequest) body: CreateVisitRequest) {
    return this.visits.create(auth, body);
  }

  @Patch(':id')
  @CheckPolicy('update', 'Visit')
  @Audited('Visit')
  @ApiIdParam()
  @ApiZodBody(UpdateVisitRequest)
  update(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(UpdateVisitRequest) body: UpdateVisitRequest) {
    return this.visits.update(auth, id, body);
  }

  @Post(':id/assignments')
  @HttpCode(200)
  @CheckPolicy('assign', 'Visit')
  @Audited('Visit')
  @ApiOperation({ summary: 'Assign technicians/engineers to a visit' })
  @ApiIdParam()
  @ApiZodBody(AssignTechniciansRequest)
  assign(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(AssignTechniciansRequest) body: AssignTechniciansRequest) {
    return this.visits.assign(auth, id, body);
  }

  @Delete(':id/assignments/:userId')
  @HttpCode(200)
  @CheckPolicy('assign', 'Visit')
  @Audited('Visit')
  @ApiIdParam()
  @ApiIdParam('userId')
  unassign(@Auth() auth: AuthContext, @IdParam() id: string, @IdParam('userId') userId: string) {
    return this.visits.unassign(auth, id, userId);
  }
}
