import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, jpeg, siteWithVisit, startHarness, type Harness } from './harness.js';

let h: Harness;
let admin: string;
let tech: { id: string; token: string };
let otherTech: { id: string; token: string };
let ids: { siteId: string; visitId: string };

type Photo = { id: string; status: string; category: string; categoryState: string; captureSource: string; proposedCategory: string | null; uploadBatchId: string | null; fileName: string | null };

beforeAll(async () => {
  h = await startHarness();
  admin = (await h.login(ADMIN.email, ADMIN.password)).accessToken;
  tech = await h.createUser(admin, 'technician');
  otherTech = await h.createUser(admin, 'technician');
  ids = await siteWithVisit(h, admin, tech.id);
});

afterAll(async () => {
  await h?.close();
});

describe('bulk upload with AI-proposed categories (ADR 0005)', () => {
  const batch = randomUUID();
  const photoIds: string[] = [];

  it('stores bulk photos as classifying and does not analyse them', async () => {
    for (const [i, fileName] of ['site-a/PDU/pdu (1).jpeg', 'site-a/Rack/rack (2).jpeg'].entries()) {
      const res = await h.upload(
        admin,
        { clientUuid: randomUUID(), visitId: ids.visitId, category: 'rack', captureSource: 'web_bulk', uploadBatchId: batch, autoCategory: true, fileName },
        await jpeg(900 + i),
      );
      expect(res.status).toBe(201);
      const p = res.json<{ photo: Photo }>().photo;
      expect(p).toMatchObject({ status: 'uploaded', categoryState: 'classifying', captureSource: 'web_bulk', uploadBatchId: batch, fileName });
      photoIds.push(p.id);
    }
    await h.queue.drain();
    const list = await h.request({ method: 'GET', url: `/api/v1/photos?uploadBatchId=${batch}`, token: admin });
    const items = list.json<{ items: Photo[] }>().items;
    expect(items).toHaveLength(2);
    for (const p of items) expect(p).toMatchObject({ status: 'uploaded', categoryState: 'proposed', proposedCategory: 'rack' });
    expect(await h.prisma.analysis.count({ where: { photoId: { in: photoIds } } })).toBe(0);
  });

  it('refuses autoCategory for live captures and re-shots', async () => {
    const res = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'rack', autoCategory: true });
    expect(res.status).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_AUTO_CATEGORY');
  });

  it('only the visit uploaders can confirm', async () => {
    const res = await h.request({ method: 'POST', url: '/api/v1/photos/confirm-categories', token: otherTech.token, body: { items: [{ photoId: photoIds[0], category: 'pdu' }] } });
    expect(res.status).toBe(404);
  });

  it('confirming moves each photo to its category and analyses it; repeats are skipped', async () => {
    const body = { items: [{ photoId: photoIds[0], category: 'pdu' }, { photoId: photoIds[1], category: 'rack' }] };
    const res = await h.request({ method: 'POST', url: '/api/v1/photos/confirm-categories', token: admin, body });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ confirmed: 2, skipped: 0 });
    const pdu = await h.prisma.photo.findUniqueOrThrow({ where: { id: photoIds[0] }, include: { submission: true } });
    expect(pdu).toMatchObject({ category: 'pdu', categoryState: 'confirmed', submission: { category: 'pdu', visitId: ids.visitId } });

    await h.queue.drain();
    for (const id of photoIds) {
      expect(await h.prisma.analysis.count({ where: { photoId: id } })).toBe(1);
      expect((await h.prisma.photo.findUniqueOrThrow({ where: { id } })).status).toBe('pending_review');
    }
    const again = await h.request({ method: 'POST', url: '/api/v1/photos/confirm-categories', token: admin, body });
    expect(again.json()).toEqual({ confirmed: 0, skipped: 2 });
  });

  it('camera uploads are unchanged: confirmed and analysed right away', async () => {
    const res = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'router' }, await jpeg(950));
    const p = res.json<{ photo: Photo }>().photo;
    expect(p).toMatchObject({ categoryState: 'confirmed', captureSource: 'camera' });
    await h.queue.drain();
    expect(await h.prisma.analysis.count({ where: { photoId: p.id } })).toBe(1);
  });
});
