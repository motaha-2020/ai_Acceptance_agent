import sharp from 'sharp';
import { EMPTY_TECHNICAL, SiteTechnical } from '@acceptance/parsers';
import type { PrismaClient } from '@acceptance/db';
import type { GalleryPhoto, ReportData } from '@acceptance/report';
import type { PhotoCategory, PhotoStatus } from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import { agreementRate, mergeSiteData, selectBom, technicalWarnings } from './map.js';

export interface CollectOptions {
  /** Longest edge of gallery images (px). */
  maxImageEdge?: number;
  jpegQuality?: number;
  /** Cap per category so one category cannot blow up the document. */
  maxPhotosPerCategory?: number;
}

const TECH_COLUMNS = ['siteData', 'inventory', 'lld', 'portMap', 'utilization', 'fiberTests', 'survey'] as const;

/** Read the stored technical data; an invalid column is dropped with a warning instead of failing the report. */
export function readTechnical(row: Partial<Record<(typeof TECH_COLUMNS)[number], unknown>> | null, warnings: string[]): SiteTechnical {
  if (!row) return EMPTY_TECHNICAL;
  const clean: Record<string, unknown> = {};
  for (const col of TECH_COLUMNS) {
    const value = row[col];
    if (value === null || value === undefined) continue;
    const parsed = SiteTechnical.shape[col].safeParse(value);
    if (parsed.success) clean[col] = parsed.data;
    else warnings.push(`stored ${col} data is invalid and was skipped (${parsed.error.issues[0]?.message ?? 'schema mismatch'})`);
  }
  return SiteTechnical.parse(clean);
}

async function loadGallery(prisma: PrismaClient, storage: ObjectStorage, siteId: string, hostname: string | null, opts: Required<CollectOptions>, warnings: string[]): Promise<GalleryPhoto[]> {
  const photos = await prisma.photo.findMany({
    where: { siteId, status: 'approved' },
    orderBy: [{ category: 'asc' }, { capturedAt: 'asc' }, { uploadedAt: 'asc' }],
    select: { id: true, category: true, webKey: true, capturedAt: true },
  });
  const perCat = new Map<string, number>();
  const out: GalleryPhoto[] = [];
  for (const p of photos) {
    const n = (perCat.get(p.category) ?? 0) + 1;
    perCat.set(p.category, n);
    if (n > opts.maxPhotosPerCategory) continue;
    try {
      const { data, info } = await sharp(await storage.get(p.webKey))
        .rotate()
        .resize({ width: opts.maxImageEdge, height: opts.maxImageEdge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: opts.jpegQuality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      out.push({
        id: p.id,
        category: p.category as PhotoCategory,
        image: new Uint8Array(data),
        mime: 'jpg',
        width: info.width,
        height: info.height,
        device: hostname,
        capturedAt: p.capturedAt?.toISOString() ?? null,
      });
    } catch (err) {
      warnings.push(`approved photo ${p.id} could not be loaded for the gallery (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  for (const [cat, n] of perCat) if (n > opts.maxPhotosPerCategory) warnings.push(`gallery shows ${opts.maxPhotosPerCategory} of ${n} approved ${cat} photos`);
  return out;
}

/** Build ReportData for a queued report from the database and object storage. */
export async function collectReportData(prisma: PrismaClient, storage: ObjectStorage, reportId: string, options: CollectOptions = {}): Promise<ReportData> {
  const opts: Required<CollectOptions> = { maxImageEdge: 1280, jpegQuality: 70, maxPhotosPerCategory: 12, ...options };
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      createdBy: { select: { name: true, role: { select: { name: true } } } },
      site: { include: { project: true, devices: { orderBy: { createdAt: 'asc' }, take: 1 }, technical: true, bomLines: { orderBy: { createdAt: 'asc' } } } },
    },
  });
  const site = report.site;
  const warnings: string[] = [];
  const tech = readTechnical(site.technical, warnings);
  const device = site.devices[0] ?? null;
  const siteData = mergeSiteData(tech.siteData, {
    name: site.name, region: site.region, room: site.room, floor: site.floor, racks: site.racks, gpsLat: site.gpsLat, gpsLng: site.gpsLng,
    projectName: site.project.name,
    device: device ? { model: device.model, hostname: device.hostname, serial: device.serial, loopbackIp: device.loopbackIp } : null,
  });
  const bom = selectBom(site.bomLines, tech);
  warnings.push(...technicalWarnings(tech, bom, siteData));

  const [photoGroups, snags, analyses, reviews] = await Promise.all([
    prisma.photo.groupBy({ by: ['category', 'status'], where: { siteId: site.id }, _count: { _all: true } }),
    prisma.snag.findMany({ where: { photo: { siteId: site.id }, dismissedAt: null }, select: { code: true, status: true, photo: { select: { category: true } } } }),
    prisma.analysis.groupBy({ by: ['provider', 'model', 'promptVersion'], where: { photo: { siteId: site.id }, status: 'succeeded' }, _count: { _all: true } }),
    prisma.review.findMany({ where: { photo: { siteId: site.id } }, select: { verdict: true, aiVerdict: true, reviewer: { select: { name: true, role: { select: { name: true } } } } } }),
  ]);
  const gallery = await loadGallery(prisma, storage, site.id, siteData.hostname, opts, warnings);
  const reviewers = [...new Map(reviews.map((r) => [r.reviewer.name, { name: r.reviewer.name, role: r.reviewer.role.name }])).values()];

  return {
    meta: {
      reportId: report.id,
      version: report.version,
      draft: report.draft,
      generatedAt: new Date().toISOString(),
      generatedBy: { name: report.createdBy.name, role: report.createdBy.role.name },
    },
    project: { code: site.project.code, name: site.project.name, clientName: site.project.clientName },
    site: { code: site.code, name: site.name, exchange: site.exchange, nameAr: null },
    siteData,
    inventory: tech.inventory,
    lld: tech.lld,
    bom,
    portMap: tech.portMap,
    utilization: tech.utilization,
    fiberTests: tech.fiberTests,
    survey: tech.survey,
    photoStats: photoGroups.map((g) => ({ category: g.category as PhotoCategory, status: g.status as PhotoStatus, count: g._count._all })),
    snags: snags.map((s) => ({ code: s.code, category: s.photo.category as PhotoCategory, status: s.status })),
    gallery,
    ai: {
      models: analyses.map((a) => ({ provider: a.provider, model: a.model, promptVersion: a.promptVersion, analyses: a._count._all })),
      reviews: reviews.length,
      agreementRate: agreementRate(reviews),
    },
    reviewers,
    warnings,
  };
}
