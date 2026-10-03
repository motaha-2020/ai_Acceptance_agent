import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImportSiteDocumentsResult, ReportDownloadDto, ReportDto, SiteDocumentsDto } from '@acceptance/shared';
import { ADMIN, siteWithVisit, startHarness, type Harness } from './harness.js';

const INVENTORY = [
  'RP/0/RSP0/CPU0:RPT-HOST#show inventory',
  'NAME: "Rack 0", DESCR: "ASR 9906 Chassis"',
  'PID: ASR-9906 , VID: V01, SN: CH1',
  'NAME: "0/PT0-PM0", DESCR: "4.4kW DC Power Module"',
  'PID: PWR-4.4KW-DC-V3 , VID: V05, SN: PM1',
].join('\n');

let h: Harness;
let admin: string;
let ids: { siteId: string; visitId: string };
let tech: { id: string; token: string };
const users: Record<string, string> = {};

async function multipart(token: string, siteId: string, files: { name: string; text: string }[]) {
  const form = new FormData();
  for (const f of files) form.append('files', new Blob([f.text], { type: 'application/octet-stream' }), f.name);
  const res = await h.app.getHttpAdapter().getInstance().inject({ method: 'POST', url: `/api/v1/sites/${siteId}/documents`, headers: { authorization: `Bearer ${token}` }, payload: form });
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
}

beforeAll(async () => {
  h = await startHarness();
  admin = (await h.login(ADMIN.email, ADMIN.password)).accessToken;
  for (const role of ['pm', 'reviewer', 'engineer', 'viewer'] as const) users[role] = (await h.createUser(admin, role)).token;
  tech = await h.createUser(admin, 'technician');
  ids = await siteWithVisit(h, admin, tech.id);
});

afterAll(async () => {
  await h?.close();
});

describe('site documents', () => {
  it('imports source files (admin/pm only) and reports per-file failures', async () => {
    expect((await multipart(users.reviewer!, ids.siteId, [{ name: 'x#show inventory.txt', text: INVENTORY }])).status).toBe(403);
    const res = await multipart(users.pm!, ids.siteId, [
      { name: 'RPT-HOST#show inventory.txt', text: INVENTORY },
      { name: 'notes.pdf', text: 'nope' },
    ]);
    expect(res.status).toBe(201);
    const body = res.body as unknown as ImportSiteDocumentsResult;
    expect(body.imported).toEqual([{ name: 'RPT-HOST#show inventory.txt', kind: 'inventory', summary: '2 inventory entries for RPT-HOST' }]);
    expect(body.failed.map((f) => f.name)).toEqual(['notes.pdf']);
    expect(body.parts.inventory).toBe(2);
    expect(body.sources[0]).toMatchObject({ kind: 'inventory', name: 'RPT-HOST#show inventory.txt' });

    expect((await multipart(admin, ids.siteId, [{ name: 'notes.pdf', text: 'x' }])).status).toBe(400);
  });

  it('accepts manual site data and survey answers', async () => {
    const res = await h.request({ method: 'PATCH', url: `/api/v1/sites/${ids.siteId}/documents`, token: admin, body: { siteData: { region: 'القاهره', contractNumber: 'PO#17' }, survey: { V1: { value: '3 Good' }, F1: { value: 'Raised floor' } } } });
    expect(res.status).toBe(200);
    expect(res.json<SiteDocumentsDto>().parts).toMatchObject({ siteData: true, survey: 2, inventory: 2 });
    const removed = await h.request({ method: 'PATCH', url: `/api/v1/sites/${ids.siteId}/documents`, token: admin, body: { survey: { F1: null } } });
    expect(removed.json<SiteDocumentsDto>().parts.survey).toBe(1);
    expect((await h.request({ method: 'PATCH', url: `/api/v1/sites/${ids.siteId}/documents`, token: admin, body: { survey: { bad: { value: 'x' } } } })).status).toBe(400);
    expect((await h.request({ method: 'GET', url: `/api/v1/sites/${ids.siteId}/documents`, token: users.viewer })).status).toBe(200);
  });
});

describe('reports', () => {
  it('only admin, pm and reviewer may generate', async () => {
    for (const t of [tech.token, users.engineer!, users.viewer!]) {
      expect((await h.request({ method: 'POST', url: `/api/v1/sites/${ids.siteId}/reports`, token: t, body: { draft: true } })).status).toBe(403);
    }
  });

  it('blocks a final report while photos await review, allows a draft, and generates it in the worker', async () => {
    const up = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'rack' });
    expect(up.status).toBe(201);
    await h.queue.drain();

    const blocked = await h.request({ method: 'POST', url: `/api/v1/sites/${ids.siteId}/reports`, token: users.reviewer, body: {} });
    expect(blocked.status).toBe(409);
    expect(blocked.json<{ error: { code: string; details: unknown } }>().error).toMatchObject({ code: 'REPORT_BLOCKED', details: { openSnags: 0, unverifiedFixes: 0, unreviewedPhotos: 1 } });

    const created = await h.request({ method: 'POST', url: `/api/v1/sites/${ids.siteId}/reports`, token: users.reviewer, body: { draft: true } });
    expect(created.status).toBe(201);
    expect(created.json<ReportDto>()).toMatchObject({ version: 1, status: 'queued', draft: true });
    await h.queue.drain();

    const list = (await h.request({ method: 'GET', url: `/api/v1/sites/${ids.siteId}/reports`, token: users.viewer })).json<ReportDto[]>();
    expect(list[0]).toMatchObject({ version: 1, status: 'ready', hasDocx: true, hasPdf: false });
    expect(list[0]!.warnings).toContain('PDF not generated: LibreOffice (soffice) is not installed on the worker');
    expect(list[0]!.meta?.checklist).toMatchObject({ manual: 1 });

    const audit = await h.prisma.auditLog.findFirst({ where: { action: 'Report.create', statusCode: 201 } });
    expect(audit?.entityId).toBe(ids.siteId);
  });

  it('serves a signed DOCX download; PDF is 404 without LibreOffice', async () => {
    const [report] = (await h.request({ method: 'GET', url: `/api/v1/sites/${ids.siteId}/reports`, token: admin })).json<ReportDto[]>();
    const dl = await h.request({ method: 'GET', url: `/api/v1/reports/${report!.id}/download?format=docx`, token: users.viewer });
    expect(dl.status).toBe(200);
    const { url, fileName } = dl.json<ReportDownloadDto>();
    expect(fileName).toMatch(/^SID-HOST-.*-v1-DRAFT\.docx$/);
    const file = await h.app.getHttpAdapter().getInstance().inject({ method: 'GET', url: url.replace('http://api.test', '') });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(file.headers['content-disposition']).toContain(fileName);

    const pdf = await h.request({ method: 'GET', url: `/api/v1/reports/${report!.id}/download?format=pdf`, token: admin });
    expect(pdf.status).toBe(404);
    expect(pdf.json<{ error: { code: string } }>().error.code).toBe('FORMAT_NOT_AVAILABLE');
  });

  it('versions increase and a final report is allowed once everything is reviewed', async () => {
    await h.prisma.photo.updateMany({ where: { siteId: ids.siteId }, data: { status: 'approved' } });
    const res = await h.request({ method: 'POST', url: `/api/v1/sites/${ids.siteId}/reports`, token: users.pm, body: { draft: false } });
    expect(res.status).toBe(201);
    expect(res.json<ReportDto>()).toMatchObject({ version: 2, draft: false });
    await h.queue.drain();
    const r = (await h.request({ method: 'GET', url: `/api/v1/reports/${res.json<ReportDto>().id}`, token: admin })).json<ReportDto>();
    expect(r).toMatchObject({ status: 'ready', meta: { galleryPhotos: 1 } });
    expect((await h.request({ method: 'GET', url: `/api/v1/sites/${ids.siteId}/reports/blockers`, token: admin })).json()).toEqual({ openSnags: 0, unverifiedFixes: 0, unreviewedPhotos: 0 });
  });

  it('returns 404 for unknown site/report and 409 for a report that is not ready', async () => {
    expect((await h.request({ method: 'POST', url: '/api/v1/sites/nope/reports', token: admin, body: { draft: true } })).status).toBe(404);
    expect((await h.request({ method: 'GET', url: '/api/v1/reports/nope/download', token: admin })).status).toBe(404);
    const site = await h.prisma.site.findUniqueOrThrow({ where: { id: ids.siteId } });
    const queued = await h.prisma.report.create({ data: { siteId: site.id, version: 99, createdById: (await h.prisma.user.findFirstOrThrow()).id } });
    expect((await h.request({ method: 'GET', url: `/api/v1/reports/${queued.id}/download`, token: admin })).status).toBe(409);
  });
});
