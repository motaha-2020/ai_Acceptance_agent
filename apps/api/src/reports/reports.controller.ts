import { Controller, Get, Inject, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {} from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { CreateReportRequest, ReportDownloadQuery, SiteDocumentKind, UpdateSiteDocumentsRequest } from '@acceptance/shared';
import { z } from 'zod';
import { Audited } from '../audit/audit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy } from '../auth/decorators.js';
import type { AppConfig } from '../config/config.js';
import { badRequest, DomainError, forbidden } from '../core/errors.js';
import { CONFIG } from '../core/tokens.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';
import { ReportsService } from './reports.service.js';
import { SiteDocumentsService, type UploadedDocument } from './site-documents.service.js';

const MAX_FILES = 20;
const Kinds = z.record(SiteDocumentKind);

/** Importing/editing site documents changes report content: admins and project managers only. */
function assertDocumentEditor(auth: AuthContext): void {
  if (auth.user.role !== 'admin' && auth.user.role !== 'pm') throw forbidden('Only admins and project managers can change site documents');
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('sites')
export class SiteReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(SiteDocumentsService) private readonly documents: SiteDocumentsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Post(':id/reports')
  @CheckPolicy('create', 'Report')
  @Audited('Report')
  @ApiOperation({ summary: 'Queue an acceptance report (SID layout). 409 REPORT_BLOCKED while open snags or unreviewed photos exist, unless draft=true' })
  @ApiIdParam()
  @ApiZodBody(CreateReportRequest)
  create(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(CreateReportRequest) body: CreateReportRequest) {
    return this.reports.create(auth, id, body.draft);
  }

  @Get(':id/reports')
  @CheckPolicy('read', 'Report')
  @ApiOperation({ summary: 'Report versions of a site, newest first' })
  @ApiIdParam()
  list(@IdParam() id: string) {
    return this.reports.list(id);
  }

  @Get(':id/reports/blockers')
  @CheckPolicy('read', 'Report')
  @ApiOperation({ summary: 'Counts that block a final report' })
  @ApiIdParam()
  blockers(@IdParam() id: string) {
    return this.reports.blockers(id);
  }

  @Get(':id/documents')
  @CheckPolicy('read', 'Site')
  @ApiOperation({ summary: 'Technical documents imported for the report (parts, sources, cross-check warnings)' })
  @ApiIdParam()
  documentsSummary(@IdParam() id: string) {
    return this.documents.summary(id);
  }

  @Post(':id/documents')
  @CheckPolicy('update', 'Site')
  @Audited('SiteDocuments')
  @ApiOperation({
    summary: 'Import site source files (admin/pm): show inventory .txt, LLD/SID .docx, ODF mapping/utilization and fiber test .xlsx',
    description: 'multipart: one or more `files`; optional `kinds` JSON {fileName: kind} when names are not conventional. Merges into stored data.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } }, kinds: { type: 'string', description: 'JSON' } } } })
  @ApiIdParam()
  async importDocuments(@Auth() auth: AuthContext, @IdParam() id: string, @Req() req: FastifyRequest) {
    assertDocumentEditor(auth);
    const { files, kinds } = await this.readMultipart(req);
    return this.documents.import(auth, id, files, kinds);
  }

  @Patch(':id/documents')
  @CheckPolicy('update', 'Site')
  @Audited('SiteDocuments')
  @ApiOperation({ summary: 'Correct site-data fields and answer non-photo checklist items (admin/pm)' })
  @ApiIdParam()
  @ApiZodBody(UpdateSiteDocumentsRequest)
  updateDocuments(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(UpdateSiteDocumentsRequest) body: UpdateSiteDocumentsRequest) {
    assertDocumentEditor(auth);
    return this.documents.update(auth, id, body);
  }

  private async readMultipart(req: FastifyRequest): Promise<{ files: UploadedDocument[]; kinds: Record<string, SiteDocumentKind> }> {
    if (!req.isMultipart()) throw new DomainError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use multipart/form-data');
    const files: UploadedDocument[] = [];
    let kinds: Record<string, SiteDocumentKind> = {};
    for await (const part of req.parts({ limits: { fileSize: this.config.UPLOAD_MAX_BYTES, files: MAX_FILES, fields: 4, fieldSize: 16 * 1024 } })) {
      if (part.type === 'file') {
        const data = await part.toBuffer();
        if (!part.filename) throw badRequest('INVALID_MULTIPART', 'Every file needs a file name');
        if (files.some((f) => f.name === part.filename)) throw badRequest('INVALID_MULTIPART', `Duplicate file name ${part.filename}`);
        files.push({ name: part.filename, data });
      } else if (part.fieldname === 'kinds') {
        const parsed = Kinds.safeParse(safeJson(String(part.value)));
        if (!parsed.success) throw badRequest('INVALID_MULTIPART', '`kinds` must be JSON {fileName: kind}');
        kinds = parsed.data;
      }
    }
    if (!files.length) throw badRequest('INVALID_MULTIPART', 'Send at least one file');
    return { files, kinds };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get(':id')
  @CheckPolicy('read', 'Report')
  @ApiIdParam()
  get(@IdParam() id: string) {
    return this.reports.get(id);
  }

  @Get(':id/download')
  @CheckPolicy('read', 'Report')
  @ApiOperation({ summary: 'Signed, expiring download URL for the DOCX or PDF of a ready report' })
  @ApiIdParam()
  @ApiZodQuery(ReportDownloadQuery)
  download(@IdParam() id: string, @ZQuery(ReportDownloadQuery) q: ReportDownloadQuery) {
    return this.reports.download(id, q.format);
  }
}
