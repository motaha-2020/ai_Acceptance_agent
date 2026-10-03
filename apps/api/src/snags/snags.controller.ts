import { Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FixSnagRequest, ListSnagsQuery, ReopenSnagRequest } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy } from '../auth/decorators.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';
import { SnagsService } from './snags.service.js';

@ApiTags('snags')
@ApiBearerAuth()
@Controller('snags')
export class SnagsController {
  constructor(@Inject(SnagsService) private readonly snags: SnagsService) {}

  @Get()
  @CheckPolicy('read', 'Snag')
  @ApiOperation({ summary: 'Snag tracker (filters: project, site, visit, photo, category, status, source, code)' })
  @ApiZodQuery(ListSnagsQuery)
  list(@Auth() auth: AuthContext, @ZQuery(ListSnagsQuery) q: ListSnagsQuery) {
    return this.snags.list(auth, q);
  }

  @Get(':id')
  @CheckPolicy('read', 'Snag')
  @ApiIdParam()
  get(@Auth() auth: AuthContext, @IdParam() id: string) {
    return this.snags.get(auth, id);
  }

  @Post(':id/fix')
  @HttpCode(200)
  @CheckPolicy('fix', 'Snag')
  @Audited('Snag')
  @ApiOperation({ summary: 'Mark a snag fixed by linking the re-shot photo (open -> fixed)' })
  @ApiIdParam()
  @ApiZodBody(FixSnagRequest)
  fix(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(FixSnagRequest) body: FixSnagRequest) {
    return this.snags.fix(auth, id, body);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @CheckPolicy('verify', 'Snag')
  @Audited('Snag')
  @ApiOperation({ summary: 'Verify a fixed snag (fixed -> verified)' })
  @ApiIdParam()
  verify(@Auth() auth: AuthContext, @IdParam() id: string) {
    return this.snags.verify(auth, id);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @CheckPolicy('verify', 'Snag')
  @Audited('Snag', { captureBody: ['reason'] })
  @ApiOperation({ summary: 'Reject a fix (fixed -> open)' })
  @ApiIdParam()
  @ApiZodBody(ReopenSnagRequest)
  reopen(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(ReopenSnagRequest) _body: ReopenSnagRequest) {
    return this.snags.reopen(auth, id);
  }
}
