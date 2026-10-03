import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListAuditLogsQuery } from '@acceptance/shared';
import { CheckPolicy } from '../auth/decorators.js';
import { ApiZodQuery, ZQuery } from '../core/zod.js';
import { AuditService } from './audit.service.js';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @CheckPolicy('read', 'AuditLog')
  @ApiOperation({ summary: 'Append-only audit trail of all mutations (newest first)' })
  @ApiZodQuery(ListAuditLogsQuery)
  list(@ZQuery(ListAuditLogsQuery) q: ListAuditLogsQuery) {
    return this.audit.list(q);
  }
}
