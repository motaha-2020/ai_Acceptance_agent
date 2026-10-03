import type { Prisma, PrismaClient } from '@acceptance/db';
import { JobName, UnrecoverableJobError, type GenerateReportJob, type JobContext, type JobQueue } from '@acceptance/queue';
import { buildAcceptanceReport, checklistTotals, convertDocxToPdf, deriveChecklist, findSoffice, summarizeCategories, type ReportData } from '@acceptance/report';
import type { ObjectStorage } from '@acceptance/storage';
import type { Logger } from '../processor.js';
import { collectReportData, type CollectOptions } from './collect.js';
import { reportFileBase } from './map.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** DOCX -> PDF converter; null = PDF export not available on this host. */
export type PdfConverter = ((docx: Uint8Array) => Promise<Buffer>) | null;

export function defaultPdfConverter(): PdfConverter {
  const soffice = findSoffice();
  return soffice ? (docx) => convertDocxToPdf(docx, { sofficePath: soffice }) : null;
}

export interface GenerateReportDeps {
  prisma: PrismaClient;
  storage: ObjectStorage;
  logger: Logger;
  pdf: PdfConverter;
  collect?: CollectOptions;
}

/** Build statistics stored in reports.meta (shown by the web UI without opening the file). */
export function reportMeta(data: ReportData): Prisma.InputJsonObject {
  const items = deriveChecklist(data);
  return {
    checklist: checklistTotals(items),
    categories: summarizeCategories(data).map((c) => ({ category: c.category, approved: c.approved, openSnags: c.openSnags, status: c.status })),
    galleryPhotos: data.gallery.length,
    bomSource: data.bom.activeSource,
    ai: { models: data.ai.models, reviews: data.ai.reviews, agreementRate: data.ai.agreementRate },
  };
}

/**
 * `generate-report` job: queued -> running -> ready (DOCX + PDF when LibreOffice exists) | failed.
 * Re-running a ready report is a no-op; files are written under a per-report key so retries overwrite.
 */
export class GenerateReportProcessor {
  constructor(private readonly deps: GenerateReportDeps) {}

  async handle(job: JobContext<GenerateReportJob>): Promise<void> {
    const { prisma, storage, logger } = this.deps;
    const report = await prisma.report.findUnique({ where: { id: job.data.reportId }, include: { site: { select: { id: true, code: true } } } });
    if (!report) throw new UnrecoverableJobError(`report ${job.data.reportId} not found`);
    if (report.status === 'ready') return;
    await prisma.report.update({ where: { id: report.id }, data: { status: 'running', startedAt: new Date(), error: null } });

    const data = await collectReportData(prisma, storage, report.id, this.deps.collect);
    const docx = await buildAcceptanceReport(data);
    const base = reportFileBase(data.siteData.hostname ?? report.site.code, report.version, report.draft);
    const prefix = `reports/${report.site.id}/${report.id}`;
    const docxKey = `${prefix}/${base}.docx`;
    await storage.put(docxKey, docx, { contentType: DOCX_MIME });

    const warnings = [...data.warnings];
    let pdfKey: string | null = null;
    let pdfBytes: number | null = null;
    if (this.deps.pdf) {
      try {
        const pdf = await this.deps.pdf(docx);
        pdfKey = `${prefix}/${base}.pdf`;
        pdfBytes = pdf.length;
        await storage.put(pdfKey, pdf, { contentType: 'application/pdf' });
      } catch (err) {
        warnings.push(`PDF not generated: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      warnings.push('PDF not generated: LibreOffice (soffice) is not installed on the worker');
    }

    await prisma.report.update({
      where: { id: report.id },
      data: { status: 'ready', docxKey, docxBytes: docx.length, pdfKey, pdfBytes, warnings, meta: reportMeta(data), finishedAt: new Date(), error: null },
    });
    logger.info({ reportId: report.id, siteId: report.site.id, version: report.version, docxBytes: docx.length, pdfBytes, warnings: warnings.length }, 'report generated');
  }

  /** Final failure: keep the reason on the row so the UI can show it. */
  async fail(reportId: string, error: Error): Promise<void> {
    await this.deps.prisma.report.update({ where: { id: reportId }, data: { status: 'failed', error: error.message.slice(0, 1000), finishedAt: new Date() } }).catch(() => undefined);
  }
}

export interface ReportRuntimeDeps {
  prisma: PrismaClient;
  storage: ObjectStorage;
  queue: JobQueue;
  logger: Logger;
  /** Defaults to LibreOffice when installed. */
  pdf?: PdfConverter;
  concurrency?: number;
}

/** Register the generate-report consumer (standalone worker and the API's embedded worker). */
export function startReportRuntime(deps: ReportRuntimeDeps): GenerateReportProcessor {
  const pdf = deps.pdf === undefined ? defaultPdfConverter() : deps.pdf;
  const processor = new GenerateReportProcessor({ prisma: deps.prisma, storage: deps.storage, logger: deps.logger, pdf });
  deps.queue.consume<GenerateReportJob>(JobName.generateReport, (job) => processor.handle(job), {
    concurrency: deps.concurrency ?? 1,
    onFailed: async (job, error, final) => {
      deps.logger.error({ reportId: job.data.reportId, attempt: job.attempt, final, err: error.message }, 'generate-report failed');
      if (final) await processor.fail(job.data.reportId, error);
    },
  });
  deps.logger.info({ pdf: pdf ? 'libreoffice' : 'disabled', queue: deps.queue.kind }, 'report worker started');
  return processor;
}
