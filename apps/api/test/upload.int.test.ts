import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, jpeg, siteWithVisit, startHarness, type Harness } from './harness.js';

let h: Harness;
let admin: string;
let tech: { id: string; token: string };
let otherTech: { id: string; token: string };
let ids: { siteId: string; visitId: string };

beforeAll(async () => {
  h = await startHarness({ UPLOAD_MAX_BYTES: String(200 * 1024) });
  admin = (await h.login(ADMIN.email, ADMIN.password)).accessToken;
  tech = await h.createUser(admin, 'technician');
  otherTech = await h.createUser(admin, 'technician');
  ids = await siteWithVisit(h, admin, tech.id);
});

afterAll(async () => {
  await h?.close();
});

type UploadBody = { created: boolean; duplicate?: string; photo: { id: string; duplicateOfId: string | null } };

describe('photo upload idempotency', () => {
  it('a retried upload with the same clientUuid returns the stored photo (200) without a second row or job', async () => {
    const clientUuid = randomUUID();
    const image = await jpeg(1);
    const first = await h.upload(tech.token, { clientUuid, visitId: ids.visitId, category: 'router' }, image);
    expect(first.status).toBe(201);
    const second = await h.upload(tech.token, { clientUuid, visitId: ids.visitId, category: 'router' }, image);
    expect(second.status).toBe(200);
    expect(second.json<UploadBody>()).toMatchObject({ created: false, duplicate: 'client_uuid', photo: { id: first.json<UploadBody>().photo.id } });
    expect(await h.prisma.photo.count({ where: { clientUuid } })).toBe(1);
    await h.queue.drain();
    expect(await h.prisma.analysis.count({ where: { photoId: first.json<UploadBody>().photo.id } })).toBe(1);
  });

  it('concurrent retries of the same capture create exactly one photo', async () => {
    const clientUuid = randomUUID();
    const image = await jpeg(2);
    const results = await Promise.all([1, 2, 3, 4].map(() => h.upload(tech.token, { clientUuid, visitId: ids.visitId, category: 'duct' }, image)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.json<UploadBody>().photo.id)).size).toBe(1);
    expect(await h.prisma.photo.count({ where: { clientUuid } })).toBe(1);
  });

  it('identical bytes in the same visit/category are de-duplicated by sha256', async () => {
    const image = await jpeg(3);
    const a = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'pdu' }, image);
    const b = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'pdu' }, image);
    expect(b.status).toBe(200);
    expect(b.json<UploadBody>()).toMatchObject({ created: false, duplicate: 'content', photo: { id: a.json<UploadBody>().photo.id } });
  });

  it('identical bytes in another category are stored once but flagged as a possible reused photo', async () => {
    const image = await jpeg(4);
    const a = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'earth_path' }, image);
    const b = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'power_path' }, image);
    expect(b.status).toBe(201);
    expect(b.json<UploadBody>().photo.duplicateOfId).toBe(a.json<UploadBody>().photo.id);
  });

  it('reusing a clientUuid for a different visit is a conflict', async () => {
    const clientUuid = randomUUID();
    await h.upload(tech.token, { clientUuid, visitId: ids.visitId, category: 'rack' });
    const other = await siteWithVisit(h, admin, tech.id);
    const res = await h.upload(tech.token, { clientUuid, visitId: other.visitId, category: 'rack' });
    expect(res.status).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('CLIENT_UUID_CONFLICT');
  });
});

describe('photo upload validation and access', () => {
  it('rejects technicians that are not assigned to the visit (404, no existence leak)', async () => {
    const res = await h.upload(otherTech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'rack' });
    expect(res.status).toBe(404);
  });

  it('rejects non-images by content, not by declared type', async () => {
    const res = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'rack' }, Buffer.from('definitely not a jpeg'));
    expect(res.status).toBe(415);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects files above UPLOAD_MAX_BYTES with 413', async () => {
    const big = await jpeg(5, 1024); // ~1 MB of noise > 200 KB limit
    const res = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'rack' }, big);
    expect(res.status).toBe(413);
  });

  it('validates metadata with the shared zod contract', async () => {
    const res = await h.upload(tech.token, { clientUuid: 'not-a-uuid', visitId: ids.visitId, category: 'kitchen' });
    expect(res.status).toBe(400);
    const err = res.json<{ error: { code: string; details: { path: string }[] } }>().error;
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.details.map((d) => d.path).sort()).toEqual(['category', 'clientUuid']);
  });

  it('refuses uploads to closed visits', async () => {
    const v = await siteWithVisit(h, admin, tech.id);
    await h.request({ method: 'PATCH', url: `/api/v1/visits/${v.visitId}`, token: admin, body: { status: 'cancelled' } });
    const res = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: v.visitId, category: 'rack' });
    expect(res.status).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VISIT_NOT_OPEN');
  });
});
