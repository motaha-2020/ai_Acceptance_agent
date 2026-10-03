import { Inject, Injectable } from '@nestjs/common';
import { UNIQUE_VIOLATION, type Prisma, type PrismaClient } from '@acceptance/db';
import { generateReportJobId, JobName, type JobQueue } from '@acceptance/queue';
import type { ReportBlockers, ReportDownloadDto, ReportDto, ReportFormat } from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import type { AuthContext } from '../auth/auth.types.js';
import type { AppConfig } from '../config/config.js';
import { conflict, DomainError, notFound } from '../core/errors.js';
import { CONFIG, PRISMA, QUEUE, STORAGE } from '../core/tokens.js';

const reportInclude = { createdBy: { select: { id: true, name: true } } } satisfies Prisma.ReportInclude;
type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

export function toReportDto(r: ReportRow): ReportDto {
  return {
    id: r.id,
    siteId: r.siteId,
    version: r.version,
    status: r.status,
    draft: r.draft,
    hasDocx: !!r.docxKey,
    hasPdf: !!r.pdfKey,
    docxBytes: r.docxBytes,
    pdfBytes: r.pdfBytes,
    warnings: r.warnings,
    error: r.error,
    meta: (r.meta as ReportDto['meta']) ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

const UNREVIEWED = ['uploaded', 'ai_analyzed', 'pending_review'] as const;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(QUEUE) private readonly queue: JobQueue,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** What prevents a final report: open snags, fixed-but-unverified snags, photos not yet reviewed. */
  async blockers(siteId: string): Promise<ReportBlockers> {
    const snag = { photo: { siteId }, dismissedAt: null };
    const [openSnags, unverifiedFixes, unreviewedPhotos] = await this.prisma.$transaction([
      this.prisma.snag.count({ where: { ...snag, status: 'open' } }),
      this.prisma.snag.count({ where: { ...snag, status: 'fixed' } }),
      this.prisma.photo.count({ where: { siteId, status: { in: [...UNREVIEWED] } } }),
    ]);
    return { openSnags, unverifiedFixes, unreviewedPhotos };
  }

  async create(auth: AuthContext, siteId: string, draft: boolean): Promise<ReportDto> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true, archivedAt: true } });
    if (!site || site.archivedAt) throw notFound('Site', siteId);
    if (!draft) {
      const b = await this.blockers(siteId);
      if (b.openSnags || b.unverifiedFixes || b.unreviewedPhotos) {
        throw conflict(
          'REPORT_BLOCKED',
          `Final report blocked: ${b.openSnags} open snag(s), ${b.unverifiedFixes} fix(es) awaiting verification, ${b.unreviewedPhotos} photo(s) awaiting review. Resolve them or generate a draft.`,
          b,
        );
      }
    }
    const report = await this.insertNextVersion(siteId, auth.user.id, draft);
    await this.queue.enqueue(JobName.generateReport, { reportId: report.id }, { jobId: generateReportJobId(report.id), attempts: 2, backoffMs: 10_000 });
    return toReportDto(report);
  }

  /** Version = max + 1 per site; a concurrent insert of the same version retries. */
  private async insertNextVersion(siteId: string, userId: string, draft: boolean): Promise<ReportRow> {
    for (let attempt = 0; ; attempt++) {
      const last = await this.prisma.report.findFirst({ where: { siteId }, orderBy: { version: 'desc' }, select: { version: true } });
      try {
        return await this.prisma.report.create({ data: { siteId, version: (last?.version ?? 0) + 1, draft, createdById: userId }, include: reportInclude });
      } catch (err) {
        if ((err as { code?: string }).code !== UNIQUE_VIOLATION || attempt >= 4) throw err;
      }
    }
  }

  async list(siteId: string): Promise<ReportDto[]> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) throw notFound('Site', siteId);
    const rows = await this.prisma.report.findMany({ where: { siteId }, orderBy: { version: 'desc' }, include: reportInclude, take: 50 });
    return rows.map(toReportDto);
  }

  async get(id: string): Promise<ReportDto> {
    const r = await this.prisma.report.findUnique({ where: { id }, include: reportInclude });
    if (!r) throw notFound('Report', id);
    return toReportDto(r);
  }

  async download(id: string, format: ReportFormat): Promise<ReportDownloadDto> {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw notFound('Report', id);
    if (r.status !== 'ready') throw conflict('REPORT_NOT_READY', `Report is ${r.status}`);
    const key = format === 'pdf' ? r.pdfKey : r.docxKey;
    if (!key) throw new DomainError(404, 'FORMAT_NOT_AVAILABLE', format === 'pdf' ? 'PDF was not generated for this report (see warnings)' : 'DOCX missing');
    const fileName = key.split('/').pop()!;
    const expiresIn = this.config.SIGNED_URL_TTL_SECONDS;
    const url = await this.storage.signedUrl(key, { expiresIn, downloadName: fileName });
    return { url, fileName, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }
}
