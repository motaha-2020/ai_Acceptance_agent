import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { CHECKLISTS, TAXONOMY_VERSION } from '@acceptance/checklist';
import { PERMISSION_MATRIX, PhotoCategory, Role, type PermissionRule } from '@acceptance/shared';
import { hashPassword } from './password.js';

export interface SeedOptions {
  adminEmail: string;
  /** Required; never defaulted so no known password reaches production. */
  adminPassword: string;
  adminName?: string;
  /** Path to data/sites/nasr3-r21c.json (T1.3 output). Skipped when missing. */
  nasr3SeedPath?: string;
  log?: (msg: string) => void;
}

export interface SeedSummary {
  roles: number;
  permissions: number;
  adminUserId: string;
  projectId: string;
  siteIds: string[];
  checklistTemplates: number;
  nasr3FromFile: boolean;
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full access, user management and configuration',
  pm: 'Project manager: projects, sites, visits, assignments, reports',
  reviewer: 'Reviews AI results, approves or rejects photos, verifies snag fixes',
  engineer: 'Site engineer: sites, devices, visits, uploads and snag fixes',
  technician: 'Field technician: assigned visits only, photo capture and snag fixes',
  viewer: 'Read-only access to project data',
};

/** Loose view of the T1.3 site seed (only the fields we import). */
const Nasr3Seed = z.object({
  siteId: z.string(),
  siteData: z
    .object({
      siteName: z.string().nullish(),
      region: z.string().nullish(),
      room: z.string().nullish(),
      racks: z.string().nullish(),
      deviceModel: z.string().nullish(),
      deviceSerial: z.string().nullish(),
      hostname: z.string().nullish(),
      loopbackIp: z.string().nullish(),
      gps: z.string().nullish(),
      contractNumber: z.string().nullish(),
      contractor: z.string().nullish(),
      installationDate: z.string().nullish(),
      announcementDate: z.string().nullish(),
      managementSource: z.string().nullish(),
    })
    .passthrough(),
  device: z
    .object({
      hostname: z.string().nullish(),
      platform: z.string().nullish(),
      chassisSerial: z.string().nullish(),
      modules: z.array(z.record(z.unknown())).default([]),
      transceivers: z.array(z.record(z.unknown())).default([]),
    })
    .passthrough()
    .nullish(),
  // Report technical data (T1.3 output, already validated by SiteSeed at ingest time).
  lld: z.record(z.unknown()).nullish(),
  portMap: z.array(z.unknown()).default([]),
  utilization: z.array(z.unknown()).default([]),
  fiberTests: z.array(z.unknown()).default([]),
  inventorySummary: z.record(z.number()).nullish(),
  sidBom: z.array(z.object({ partNumber: z.string(), qty: z.number(), serials: z.array(z.string()).default([]) })).default([]),
  passivePower: z.array(z.object({ description: z.string(), unit: z.string().nullish(), qty: z.number().nullish() })).default([]),
  telcoPassive: z.array(z.object({ description: z.string(), unit: z.string().nullish(), qty: z.number().nullish() })).default([]),
  warnings: z.array(z.string()).default([]),
});
type Nasr3Seed = z.infer<typeof Nasr3Seed>;

interface DemoSite {
  code: string;
  name: string;
  exchange: string;
  region?: string;
  room?: string;
  floor?: string;
  racks?: number;
  gpsLat?: number;
  gpsLng?: number;
  device: { model: string; hostname: string | null; serial?: string | null; loopbackIp?: string | null };
  meta?: Record<string, unknown>;
}

/** The demo sites whose photos exist in the raw customer folder (T1.4 catalogue). */
const DEMO_SITES: DemoSite[] = [
  { code: 'demo-asr-9902', name: 'Demo site ASR-9902', exchange: 'Demo exchange (9902 photo set)', device: { model: 'ASR-9902', hostname: 'DEMO-ASR-9902' }, meta: { photoFolder: '9902' } },
  { code: 'demo-asr-9906', name: 'Demo site ASR-9906', exchange: 'Demo exchange (9906 photo set)', device: { model: 'ASR-9906', hostname: 'DEMO-ASR-9906' }, meta: { photoFolder: '9906' } },
  { code: 'demo-ncs-57c3', name: 'Demo site NCS-57C3', exchange: 'Demo exchange (NCS-57C3 photo set)', device: { model: 'NCS-57C3', hostname: 'DEMO-NCS-57C3' }, meta: { photoFolder: 'NCS-57C3' } },
];

const NASR3_FALLBACK: DemoSite = {
  code: 'nasr3-r21c',
  name: 'NASR3…C (R21C)',
  exchange: 'NASR3',
  region: 'القاهره',
  room: 'SW Room',
  floor: '3rd floor',
  racks: 2,
  device: { model: 'ASR-9906', hostname: 'NASR3-R21C-C-EG', serial: 'FOX2904PF5C', loopbackIp: '10.45.31.74' },
  meta: { photoFolder: 'NASR3...C(R21C)', source: 'built-in fallback (data/sites/nasr3-r21c.json not found)' },
};

/** Parse "30.0500°N,31.3333°E"-style strings; returns undefined parts when out of range. */
export function parseGps(text: string | null | undefined): { lat?: number; lng?: number } {
  if (!text) return {};
  const nums = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const [lat, lng] = nums;
  return {
    lat: lat !== undefined && Math.abs(lat) <= 90 ? lat : undefined,
    lng: lng !== undefined && Math.abs(lng) <= 180 ? lng : undefined,
  };
}

function nasr3FromSeed(seed: Nasr3Seed): DemoSite {
  const sd = seed.siteData;
  const [room, floor] = (sd.room ?? '').split('||').map((s) => s.trim());
  const gps = parseGps(sd.gps);
  const racks = Number.parseInt(sd.racks ?? '', 10);
  return {
    code: seed.siteId,
    name: `${sd.siteName ?? 'NASR3'} (R21C)`,
    exchange: (sd.siteName ?? 'NASR3').replace(/[.…]+C$/, ''),
    region: sd.region ?? undefined,
    room: room || undefined,
    floor: floor || undefined,
    racks: Number.isFinite(racks) ? racks : undefined,
    gpsLat: gps.lat,
    gpsLng: gps.lng,
    device: {
      model: seed.device?.platform ?? sd.deviceModel ?? 'ASR-9906',
      hostname: seed.device?.hostname ?? sd.hostname ?? null,
      serial: seed.device?.chassisSerial ?? sd.deviceSerial ?? null,
      loopbackIp: sd.loopbackIp ?? null,
    },
    meta: {
      photoFolder: 'NASR3...C(R21C)',
      source: 'data/sites/nasr3-r21c.json',
      siteData: sd,
      inventorySummary: seed.inventorySummary ?? null,
      ingestWarnings: seed.warnings,
    },
  };
}

function flattenRules(rules: PermissionRule[]): { action: string; subject: string; conditions: string | null }[] {
  const out: { action: string; subject: string; conditions: string | null }[] = [];
  for (const r of rules) {
    const actions = Array.isArray(r.action) ? r.action : [r.action];
    const subjects = Array.isArray(r.subject) ? r.subject : [r.subject];
    for (const action of actions)
      for (const subject of subjects) out.push({ action, subject, conditions: r.scope ?? null });
  }
  return out;
}

/** Idempotent seed: safe to run on every deploy. */
export async function seedDatabase(prisma: PrismaClient, opts: SeedOptions): Promise<SeedSummary> {
  const log = opts.log ?? (() => undefined);
  if (opts.adminPassword.length < 10) throw new Error('SEED_ADMIN_PASSWORD must be at least 10 characters');

  // Roles + permission mirror
  let permissions = 0;
  const roleIds = new Map<Role, string>();
  for (const name of Role.options) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name] },
      create: { name, description: ROLE_DESCRIPTIONS[name] },
    });
    roleIds.set(name, role.id);
    const rows = flattenRules(PERMISSION_MATRIX[name]);
    await prisma.$transaction([
      prisma.permission.deleteMany({ where: { roleId: role.id } }),
      prisma.permission.createMany({ data: rows.map((r) => ({ ...r, roleId: role.id })), skipDuplicates: true }),
    ]);
    permissions += rows.length;
  }
  log(`roles: ${Role.options.length}, permissions: ${permissions}`);

  // Companies
  const contractor = await prisma.company.upsert({
    where: { name: 'RAYA Integration' },
    update: {},
    create: { name: 'RAYA Integration', kind: 'contractor' },
  });
  await prisma.company.upsert({ where: { name: 'Telecom Egypt' }, update: {}, create: { name: 'Telecom Egypt', kind: 'client' } });

  // Admin (password only set on create; re-seeding never resets a changed password)
  const adminEmail = opts.adminEmail.trim().toLowerCase();
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { roleId: roleIds.get('admin')!, isActive: true },
    create: {
      email: adminEmail,
      name: opts.adminName ?? 'Administrator',
      passwordHash: await hashPassword(opts.adminPassword),
      roleId: roleIds.get('admin')!,
      companyId: contractor.id,
    },
  });
  log(`admin: ${admin.email}`);

  // Project
  const project = await prisma.project.upsert({
    where: { code: 'TE-BIG-EDGE' },
    update: {},
    create: {
      code: 'TE-BIG-EDGE',
      name: 'TE BIG-EDGE',
      clientName: 'Telecom Egypt',
      description: 'Cisco ASR-9902 / ASR-9906 / NCS-57C3 edge router installations in telecom exchanges',
      companyId: contractor.id,
    },
  });

  // Sites
  let nasr3 = NASR3_FALLBACK;
  let nasr3FromFile = false;
  let nasr3Seed: Nasr3Seed | undefined;
  if (opts.nasr3SeedPath && existsSync(opts.nasr3SeedPath)) {
    nasr3Seed = Nasr3Seed.parse(JSON.parse(await readFile(opts.nasr3SeedPath, 'utf8')));
    nasr3 = nasr3FromSeed(nasr3Seed);
    nasr3FromFile = true;
    log(`NASR3 site loaded from ${opts.nasr3SeedPath}`);
  } else {
    log('NASR3 seed file not found; using built-in fallback');
  }

  const siteIds: string[] = [];
  for (const s of [nasr3, ...DEMO_SITES]) {
    const data = {
      name: s.name,
      exchange: s.exchange,
      region: s.region ?? null,
      room: s.room ?? null,
      floor: s.floor ?? null,
      racks: s.racks ?? null,
      gpsLat: s.gpsLat ?? null,
      gpsLng: s.gpsLng ?? null,
      meta: (s.meta ?? {}) as object,
    };
    const site = await prisma.site.upsert({
      where: { code: s.code },
      update: data,
      create: { ...data, code: s.code, projectId: project.id },
    });
    siteIds.push(site.id);
    const hostname = s.device.hostname;
    const existing = await prisma.device.findFirst({ where: { siteId: site.id, hostname } });
    const deviceData = { model: s.device.model, hostname, serial: s.device.serial ?? null, loopbackIp: s.device.loopbackIp ?? null, role: 'PE Router' };
    if (existing) await prisma.device.update({ where: { id: existing.id }, data: deviceData });
    else await prisma.device.create({ data: { ...deviceData, siteId: site.id } });

    if (s.code === nasr3.code && nasr3Seed) {
      const lines = [
        ...nasr3Seed.sidBom.map((b) => ({ kind: 'active', description: b.partNumber, partNumber: b.partNumber, qty: b.qty, unit: 'PCS', serials: b.serials })),
        ...nasr3Seed.passivePower.map((b) => ({ kind: 'passive_power', description: b.description, partNumber: null, qty: b.qty ?? null, unit: b.unit ?? null, serials: [] })),
        ...nasr3Seed.telcoPassive.map((b) => ({ kind: 'telco_passive', description: b.description, partNumber: null, qty: b.qty ?? null, unit: b.unit ?? null, serials: [] })),
      ];
      await prisma.$transaction([
        prisma.bOMLine.deleteMany({ where: { siteId: site.id, source: 'sid' } }),
        prisma.bOMLine.createMany({ data: lines.map((l) => ({ ...l, siteId: site.id, source: 'sid' })) }),
      ]);
      log(`NASR3 BOM lines: ${lines.length}`);
      await seedTechnicalData(prisma, site.id, nasr3Seed);
      log('NASR3 technical data (site data, inventory, LLD, ODF, fiber tests) seeded');
    }
  }
  log(`sites: ${siteIds.length}`);

  // Checklist templates (versioned by taxonomy version)
  for (const c of CHECKLISTS) {
    const tpl = await prisma.checklistTemplate.upsert({
      where: { category_version: { category: c.category, version: TAXONOMY_VERSION } },
      update: { titleEn: c.titleEn, titleAr: c.titleAr },
      create: { category: c.category, version: TAXONOMY_VERSION, titleEn: c.titleEn, titleAr: c.titleAr },
    });
    await prisma.$transaction([
      prisma.checklistItem.deleteMany({ where: { templateId: tpl.id } }),
      prisma.checklistItem.createMany({
        data: c.acceptanceCriteria.map((a, i) => ({
          templateId: tpl.id,
          code: a.id,
          textEn: a.textEn,
          textAr: a.textAr,
          guardsCodes: a.guardsCodes,
          sidRef: a.sidRef ?? null,
          position: i,
        })),
      }),
    ]);
  }

  // Autonomy policies: present for every category, disabled (Phase 1 = 100% human review).
  for (const category of PhotoCategory.options) {
    await prisma.autonomyPolicy.upsert({ where: { category }, update: {}, create: { category, enabled: false } });
  }

  return {
    roles: Role.options.length,
    permissions,
    adminUserId: admin.id,
    projectId: project.id,
    siteIds,
    checklistTemplates: CHECKLISTS.length,
    nasr3FromFile,
  };
}

/** Report technical data for NASR3 (site_technical_data); overwrites the row so re-seeding stays in sync with the JSON. */
async function seedTechnicalData(prisma: PrismaClient, siteId: string, seed: Nasr3Seed): Promise<void> {
  const entries = [...(seed.device?.modules ?? []), ...(seed.device?.transceivers ?? [])];
  const data = {
    siteData: seed.siteData as object,
    inventory: entries.length ? ({ hostname: seed.device?.hostname ?? '', capturedAt: null, entries } as object) : undefined,
    lld: (seed.lld ?? undefined) as object | undefined,
    portMap: seed.portMap as object,
    utilization: seed.utilization as object,
    fiberTests: seed.fiberTests as object,
    sources: [{ kind: 'sid', name: 'data/sites/nasr3-r21c.json (seed)', sha256: '', sizeBytes: 0, storageKey: null, importedAt: new Date(0).toISOString(), importedById: null }],
    warnings: seed.warnings,
  };
  await prisma.siteTechnicalData.upsert({ where: { siteId }, update: data, create: { ...data, siteId } });
}
