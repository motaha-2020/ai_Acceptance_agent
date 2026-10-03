import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisResult } from '@acceptance/shared';
import { ADMIN, startHarness, siteWithVisit, type Harness } from './harness.js';

/**
 * Main Phase 1 flow over HTTP against real PostgreSQL:
 * login -> create site/visit -> technician uploads -> worker analyzes (fake AI) ->
 * reviewer reviews -> photo approved; plus the reject -> fix -> verify loop.
 */
let h: Harness;
let admin: string;
let tech: { id: string; token: string };
let reviewer: { id: string; token: string };
let ids: { projectId: string; siteId: string; visitId: string };

const withSnag: AnalysisResult = {
  categoryMatches: true,
  qualityIssues: ['person_in_frame'],
  verdict: 'reject',
  confidence: 0.81,
  snags: [{ code: 'PERSON_IN_FRAME', severity: 'major', bbox: { x: 0.2, y: 0.1, w: 0.3, h: 0.6 }, reasonAr: 'ظهور شخص في الصورة', reasonEn: 'Person in frame' }],
};

beforeAll(async () => {
  h = await startHarness();
  admin = (await h.login(ADMIN.email, ADMIN.password)).accessToken;
  tech = await h.createUser(admin, 'technician');
  reviewer = await h.createUser(admin, 'reviewer');
  ids = await siteWithVisit(h, admin, tech.id);
});

afterAll(async () => {
  await h?.close();
});

describe('upload -> AI -> review -> approve', () => {
  let photoId: string;
  let aiSnagId: string;

  it('technician uploads a photo to an assigned visit', async () => {
    h.setAiResult((req) => {
      expect(req.category).toBe('rack');
      expect(req.context?.deviceModel).toBe('ASR-9906');
      return withSnag;
    });
    const res = await h.upload(tech.token, {
      clientUuid: randomUUID(),
      visitId: ids.visitId,
      category: 'rack',
      capturedAt: '2026-10-01T10:00:00Z',
      gps: { lat: 30.05, lng: 31.33, accuracy: 8 },
      deviceInfo: { model: 'Galaxy A54', os: 'Android 15', appVersion: '1.0.0' },
    });
    expect(res.status).toBe(201);
    const body = res.json<{ created: boolean; photo: { id: string; status: string; urls: { thumb: string; web: string }; gps: unknown; width: number } }>();
    expect(body.created).toBe(true);
    expect(body.photo.status).toBe('uploaded');
    expect(body.photo.gps).toEqual({ lat: 30.05, lng: 31.33, accuracy: 8 });
    expect(body.photo.width).toBe(256);
    photoId = body.photo.id;

    // signed URL serves the thumbnail; tampering breaks it
    const thumbUrl = new URL(body.photo.urls.thumb);
    expect(thumbUrl.origin).toBe('http://api.test');
    const file = await h.app.getHttpAdapter().getInstance().inject({ method: 'GET', url: thumbUrl.pathname + thumbUrl.search });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    const tampered = await h.app.getHttpAdapter().getInstance().inject({ method: 'GET', url: thumbUrl.pathname.replace('thumb', 'web') + thumbUrl.search });
    expect(tampered.statusCode).toBe(403);

    // visit moved to in_progress on first upload
    const visit = await h.request({ method: 'GET', url: `/api/v1/visits/${ids.visitId}`, token: tech.token });
    expect(visit.json<{ status: string }>().status).toBe('in_progress');
  });

  it('worker analyzes the photo and routes it to human review', async () => {
    await h.queue.drain();
    const res = await h.request({ method: 'GET', url: `/api/v1/photos/${photoId}`, token: reviewer.token });
    expect(res.status).toBe(200);
    const photo = res.json<{ status: string; analyses: { verdict: string; provider: string }[]; snags: { id: string; code: string; source: string }[]; exif: { make?: string } }>();
    expect(photo.status).toBe('pending_review');
    expect(photo.analyses[0]).toMatchObject({ verdict: 'reject', provider: 'fake' });
    expect(photo.snags).toHaveLength(1);
    expect(photo.snags[0]).toMatchObject({ code: 'PERSON_IN_FRAME', source: 'ai' });
    expect(photo.exif.make).toBe('TestPhone');
    aiSnagId = photo.snags[0]!.id;
  });

  it('reviewer sees the photo in the queue (oldest first, filtered by site)', async () => {
    const res = await h.request({ method: 'GET', url: `/api/v1/reviews/queue?siteId=${ids.siteId}`, token: reviewer.token });
    expect(res.status).toBe(200);
    const page = res.json<{ total: number; items: { id: string; analysis: { verdict: string }; snags: unknown[] }[] }>();
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: photoId, analysis: { verdict: 'reject' } });
    expect(page.items[0]!.snags).toHaveLength(1);
  });

  it('technician cannot review; approve is blocked while a snag is unresolved', async () => {
    expect((await h.request({ method: 'GET', url: '/api/v1/reviews/queue', token: tech.token })).status).toBe(403);
    const blocked = await h.request({ method: 'POST', url: `/api/v1/photos/${photoId}/approve`, token: reviewer.token });
    expect(blocked.status).toBe(409);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('OPEN_SNAGS');
  });

  it('reviewer overrides the AI (false positive) and approves', async () => {
    const review = await h.request({
      method: 'POST',
      url: `/api/v1/photos/${photoId}/reviews`,
      token: reviewer.token,
      body: { decision: 'override', verdict: 'accept', reason: 'Reflection of the rack door, not a person', removeSnagIds: [aiSnagId] },
    });
    expect(review.status).toBe(201);
    expect(review.json<{ review: { decision: string; aiVerdict: string; verdict: string } }>().review).toMatchObject({ decision: 'override', aiVerdict: 'reject', verdict: 'accept' });

    const approved = await h.request({ method: 'POST', url: `/api/v1/photos/${photoId}/approve`, token: reviewer.token });
    expect(approved.status).toBe(200);
    expect(approved.json<{ status: string; decidedById: string }>()).toMatchObject({ status: 'approved', decidedById: reviewer.id });

    // dismissed AI snag is kept as a negative label
    const snag = await h.prisma.snag.findUniqueOrThrow({ where: { id: aiSnagId } });
    expect(snag.dismissedAt).not.toBeNull();
    // exactly one label: the explicit review satisfied approve's label requirement
    expect(await h.prisma.review.count({ where: { photoId } })).toBe(1);
  });

  it('agreement metrics reflect the review', async () => {
    const res = await h.request({ method: 'GET', url: `/api/v1/metrics/agreement?projectId=${ids.projectId}`, token: reviewer.token });
    expect(res.status).toBe(200);
    const m = res.json<{ categories: { category: string; reviewed: number; override: number; aiSnags: number; aiSnagsDismissed: number; snagPrecision: number; policy: { enabled: boolean }; meetsThreshold: boolean }[] }>();
    const rack = m.categories.find((c) => c.category === 'rack');
    expect(rack).toMatchObject({ reviewed: 1, override: 1, aiSnags: 1, aiSnagsDismissed: 1, snagPrecision: 0, meetsThreshold: false });
    expect(rack?.policy.enabled).toBe(false);
  });

  it('every mutation is in the audit log with actor and before/after', async () => {
    const logs = await h.request({ method: 'GET', url: `/api/v1/audit-logs?entity=Photo&entityId=${photoId}`, token: admin });
    expect(logs.status).toBe(200);
    const items = logs.json<{ items: { action: string; actorId: string; before: { status: string } | null; after: { status?: string } }[] }>().items;
    const approve = items.find((i) => i.action === 'Photo.approve');
    expect(approve).toMatchObject({ actorId: reviewer.id, before: { status: 'pending_review' }, after: { status: 'approved' } });
    expect(items.some((i) => i.action === 'Photo.submit')).toBe(true);
    const login = await h.prisma.auditLog.findFirst({ where: { action: 'Auth.login' }, orderBy: { id: 'desc' } });
    expect(JSON.stringify(login?.after)).not.toContain('accessToken":"ey'); // tokens redacted
  });
});

describe('reject -> fix with re-shot -> verify', () => {
  it('runs the snag loop and approves the original photo once all snags are verified', async () => {
    h.setAiResult(() => withSnag);
    const up = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'patch_cords' });
    const photoId = up.json<{ photo: { id: string } }>().photo.id;
    await h.queue.drain();

    // reviewer agrees with the AI and rejects
    const agree = await h.request({ method: 'POST', url: `/api/v1/photos/${photoId}/reviews`, token: reviewer.token, body: { decision: 'agree' } });
    expect(agree.status).toBe(201);
    const rejected = await h.request({ method: 'POST', url: `/api/v1/photos/${photoId}/reject`, token: reviewer.token, body: { reason: 'Person in frame' } });
    expect(rejected.json<{ status: string }>().status).toBe('rejected');

    // technician re-shoots and links the fix
    h.setAiResult(() => ({ categoryMatches: true, qualityIssues: [], verdict: 'accept', confidence: 0.95, snags: [] }));
    const fixUp = await h.upload(tech.token, { clientUuid: randomUUID(), visitId: ids.visitId, category: 'patch_cords', fixesPhotoId: photoId });
    expect(fixUp.status).toBe(201);
    const fixPhotoId = fixUp.json<{ photo: { id: string; fixesPhotoId: string } }>().photo.id;
    await h.queue.drain();

    const snags = await h.request({ method: 'GET', url: `/api/v1/snags?photoId=${photoId}`, token: tech.token });
    const snagId = snags.json<{ items: { id: string; status: string }[] }>().items[0]!.id;
    const fixed = await h.request({ method: 'POST', url: `/api/v1/snags/${snagId}/fix`, token: tech.token, body: { fixPhotoId } });
    expect(fixed.status).toBe(200);
    expect(fixed.json<{ status: string; photo: { status: string } }>()).toMatchObject({ status: 'fixed', photo: { status: 'fixed' } });

    // technicians cannot verify their own fixes
    expect((await h.request({ method: 'POST', url: `/api/v1/snags/${snagId}/verify`, token: tech.token })).status).toBe(403);
    const verified = await h.request({ method: 'POST', url: `/api/v1/snags/${snagId}/verify`, token: reviewer.token });
    expect(verified.json<{ status: string; photo: { status: string } }>()).toMatchObject({ status: 'verified', photo: { status: 'approved' } });

    // invalid transition is a 409 with a clear code
    const again = await h.request({ method: 'POST', url: `/api/v1/snags/${snagId}/verify`, token: reviewer.token });
    expect(again.status).toBe(409);
    expect(again.json<{ error: { code: string } }>().error.code).toBe('INVALID_STATE_TRANSITION');
  });
});
