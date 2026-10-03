import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@acceptance/db';
import {
  emptySiteData,
  mergeTechnical,
  parseSiteDocuments,
  SiteSourceFile,
  type SiteDocumentKind,
  type SiteTechnical,
  type TechnicalUpdate,
} from '@acceptance/parsers';
import type { ImportSiteDocumentsResult, SiteDocumentsDto, UpdateSiteDocumentsRequest } from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import { readTechnical, selectBom, technicalWarnings } from '@acceptance/worker';
import type { AuthContext } from '../auth/auth.types.js';
import { badRequest, notFound } from '../core/errors.js';
import { PRISMA, STORAGE } from '../core/tokens.js';

export interface UploadedDocument {
  name: string;
  data: Buffer;
}

const MIME: Record<string, string> = {
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

@Injectable()
export class SiteDocumentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private async load(siteId: string): Promise<{ tech: SiteTechnical; sources: SiteSourceFile[]; updatedAt: Date | null; invalid: string[] }> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, include: { technical: true } });
    if (!site) throw notFound('Site', siteId);
    const invalid: string[] = [];
    const tech = readTechnical(site.technical, invalid);
    const sources = SiteSourceFile.array().safeParse(site.technical?.sources ?? []);
    return { tech, sources: sources.success ? sources.data : [], updatedAt: site.technical?.updatedAt ?? null, invalid };
  }

  private async save(siteId: string, tech: SiteTechnical, sources: SiteSourceFile[], userId: string): Promise<void> {
    const lines = await this.prisma.bOMLine.findMany({ where: { siteId } });
    const warnings = technicalWarnings(tech, selectBom(lines, tech), tech.siteData ?? emptySiteData());
    const data = {
      siteData: tech.siteData ? asJson(tech.siteData) : undefined,
      inventory: tech.inventory ? asJson(tech.inventory) : undefined,
      lld: tech.lld ? asJson(tech.lld) : undefined,
      portMap: asJson(tech.portMap),
      utilization: asJson(tech.utilization),
      fiberTests: asJson(tech.fiberTests),
      survey: asJson(tech.survey),
      sources: asJson(sources),
      warnings,
      updatedById: userId,
    };
    await this.prisma.siteTechnicalData.upsert({ where: { siteId }, update: data, create: { ...data, siteId } });
  }

  async summary(siteId: string): Promise<SiteDocumentsDto> {
    const { tech, sources, updatedAt } = await this.load(siteId);
    const row = await this.prisma.siteTechnicalData.findUnique({ where: { siteId }, select: { warnings: true } });
    const bomLines = await this.prisma.bOMLine.count({ where: { siteId } });
    return {
      siteId,
      parts: {
        siteData: !!tech.siteData,
        inventory: tech.inventory?.entries.length ?? 0,
        lld: tech.lld?.internalLinks.length ?? 0,
        portMap: tech.portMap.length,
        utilization: tech.utilization.length,
        fiberTests: tech.fiberTests.length,
        survey: Object.keys(tech.survey).length,
        bomLines,
      },
      sources: sources.map((s) => ({ kind: s.kind, name: s.name, sizeBytes: s.sizeBytes, importedAt: s.importedAt })),
      warnings: row?.warnings ?? [],
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  }

  /** Parse uploaded source files, merge them into the site's technical data and keep the raw files. */
  async import(auth: AuthContext, siteId: string, files: UploadedDocument[], kinds: Record<string, SiteDocumentKind>): Promise<ImportSiteDocumentsResult> {
    const { tech, sources } = await this.load(siteId);
    const parsed = await parseSiteDocuments(files.map((f) => ({ name: f.name, data: f.data })), kinds);
    if (!parsed.documents.length) throw badRequest('IMPORT_FAILED', 'No document could be imported', parsed.failures);

    const now = new Date().toISOString();
    const newSources: SiteSourceFile[] = [];
    for (const doc of parsed.documents) {
      const file = files.find((f) => f.name === doc.name)!;
      const sha256 = createHash('sha256').update(file.data).digest('hex');
      const ext = doc.name.split('.').pop()?.toLowerCase() ?? '';
      const key = `site-docs/${siteId}/${sha256.slice(0, 16)}-${doc.name.replace(/[^A-Za-z0-9._()-]+/g, '_').slice(-120)}`;
      await this.storage.put(key, file.data, { contentType: MIME[ext] ?? 'application/octet-stream' });
      newSources.push({ kind: doc.kind, name: doc.name, sha256, sizeBytes: file.data.length, storageKey: key, importedAt: now, importedById: auth.user.id });
    }
    await this.replaceSidBom(siteId, parsed.update);
    const merged = mergeTechnical(tech, parsed.update);
    const keep = sources.filter((s) => !newSources.some((n) => n.name === s.name && n.kind === s.kind));
    await this.save(siteId, merged, [...keep, ...newSources], auth.user.id);

    return { ...(await this.summary(siteId)), imported: parsed.documents, failed: parsed.failures };
  }

  /** A SID docx carries the delivered BOM: replace the site's SID BOM lines. */
  private async replaceSidBom(siteId: string, u: TechnicalUpdate): Promise<void> {
    if (!u.sidBom && !u.passivePower && !u.telcoPassive) return;
    const lines = [
      ...(u.sidBom ?? []).map((b) => ({ kind: 'active', description: b.partNumber, partNumber: b.partNumber, qty: b.qty, unit: 'PCS', serials: b.serials })),
      ...(u.passivePower ?? []).map((b) => ({ kind: 'passive_power', description: b.description, partNumber: null, qty: b.qty, unit: b.unit, serials: [] })),
      ...(u.telcoPassive ?? []).map((b) => ({ kind: 'telco_passive', description: b.description, partNumber: null, qty: b.qty, unit: b.unit, serials: [] })),
    ];
    await this.prisma.$transaction([
      this.prisma.bOMLine.deleteMany({ where: { siteId, source: 'sid' } }),
      this.prisma.bOMLine.createMany({ data: lines.map((l) => ({ ...l, siteId, source: 'sid' })) }),
    ]);
  }

  /** Manual site-data corrections and survey answers. */
  async update(auth: AuthContext, siteId: string, body: UpdateSiteDocumentsRequest): Promise<SiteDocumentsDto> {
    const { tech, sources } = await this.load(siteId);
    const siteData = body.siteData ? { ...(tech.siteData ?? emptySiteData()), ...body.siteData } : tech.siteData;
    const survey = { ...tech.survey };
    for (const [id, answer] of Object.entries(body.survey ?? {})) {
      if (answer === null) delete survey[id];
      else survey[id] = { value: answer.value, comment: answer.comment ?? null };
    }
    await this.save(siteId, { ...tech, siteData, survey }, sources, auth.user.id);
    return this.summary(siteId);
  }
}
