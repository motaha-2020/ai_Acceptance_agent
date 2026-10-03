import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TokenResponse } from '@acceptance/shared';
import { ADMIN, PASSWORD, siteWithVisit, startHarness, type Harness } from './harness.js';

let h: Harness;
let admin: string;

beforeAll(async () => {
  h = await startHarness({ LOGIN_RATE_LIMIT_MAX: '3' });
  admin = (await h.login(ADMIN.email, ADMIN.password)).accessToken;
});

afterAll(async () => {
  await h?.close();
});

type Err = { statusCode: number; error: { code: string; message: string }; requestId: string };

describe('authentication', () => {
  it('rejects bad credentials with the standard error shape', async () => {
    const res = await h.request({ method: 'POST', url: '/api/v1/auth/login', body: { email: ADMIN.email, password: 'wrong-password' }, headers: { 'x-forwarded-for': '10.0.0.1' } });
    expect(res.status).toBe(401);
    const body = res.json<Err>();
    expect(body).toMatchObject({ statusCode: 401, error: { code: 'INVALID_CREDENTIALS' } });
    expect(body.requestId).toBeTruthy();
  });

  it('rate-limits repeated login attempts per ip+email', async () => {
    const attempt = () =>
      h.request({ method: 'POST', url: '/api/v1/auth/login', body: { email: 'victim@acceptance.test', password: 'guess-guess' }, headers: { 'x-forwarded-for': '10.0.0.2' } });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt()).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it('requires a bearer token on protected routes', async () => {
    expect((await h.request({ method: 'GET', url: '/api/v1/projects' })).status).toBe(401);
    expect((await h.request({ method: 'GET', url: '/api/v1/projects', token: 'garbage' })).json<Err>().error.code).toBe('INVALID_TOKEN');
  });

  it('rotates refresh tokens and revokes the whole family when an old token is replayed', async () => {
    const user = await h.createUser(admin, 'viewer');
    const t1 = await h.login(user.email, PASSWORD);
    const r2 = await h.request({ method: 'POST', url: '/api/v1/auth/refresh', body: { refreshToken: t1.refreshToken } });
    expect(r2.status).toBe(200);
    const t2 = r2.json<TokenResponse>();
    expect(t2.refreshToken).not.toBe(t1.refreshToken);

    const replay = await h.request({ method: 'POST', url: '/api/v1/auth/refresh', body: { refreshToken: t1.refreshToken } });
    expect(replay.status).toBe(401);
    expect(replay.json<Err>().error.code).toBe('REFRESH_TOKEN_REUSED');
    // the legitimate successor was revoked too
    expect((await h.request({ method: 'POST', url: '/api/v1/auth/refresh', body: { refreshToken: t2.refreshToken } })).status).toBe(401);
    expect(await h.prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1); // only the createUser() login
  });

  it('logout revokes the refresh token', async () => {
    const user = await h.createUser(admin, 'viewer');
    const t = await h.login(user.email, PASSWORD);
    expect((await h.request({ method: 'POST', url: '/api/v1/auth/logout', body: { refreshToken: t.refreshToken } })).status).toBe(204);
    expect((await h.request({ method: 'POST', url: '/api/v1/auth/refresh', body: { refreshToken: t.refreshToken } })).status).toBe(401);
  });

  it('a deactivated user is locked out immediately, even with a valid access token', async () => {
    const user = await h.createUser(admin, 'engineer');
    expect((await h.request({ method: 'GET', url: '/api/v1/auth/me', token: user.token })).status).toBe(200);
    expect((await h.request({ method: 'POST', url: `/api/v1/users/${user.id}/deactivate`, token: admin })).status).toBe(200);
    expect((await h.request({ method: 'GET', url: '/api/v1/auth/me', token: user.token })).status).toBe(401);
  });

  it('/auth/me returns the role and CASL rules but never the password hash', async () => {
    const me = await h.request({ method: 'GET', url: '/api/v1/auth/me', token: admin });
    const body = me.json<{ role: string; rules: unknown[]; passwordHash?: string }>();
    expect(body.role).toBe('admin');
    expect(body.rules.length).toBeGreaterThan(0);
    expect(body.passwordHash).toBeUndefined();
  });
});

describe('authorization (RBAC + row-level scope)', () => {
  it('viewer is read-only', async () => {
    const viewer = await h.createUser(admin, 'viewer');
    expect((await h.request({ method: 'GET', url: '/api/v1/projects', token: viewer.token })).status).toBe(200);
    const create = await h.request({ method: 'POST', url: '/api/v1/projects', token: viewer.token, body: { code: 'NOPE', name: 'nope' } });
    expect(create.status).toBe(403);
    expect(create.json<Err>().error.code).toBe('FORBIDDEN');
    expect((await h.request({ method: 'GET', url: '/api/v1/users', token: viewer.token })).status).toBe(403);
  });

  it('only admins manage users', async () => {
    const pm = await h.createUser(admin, 'pm');
    const res = await h.request({ method: 'POST', url: '/api/v1/users', token: pm.token, body: { email: 'x@acceptance.test', name: 'x', password: PASSWORD, role: 'admin' } });
    expect(res.status).toBe(403);
  });

  it('technicians only see visits they are assigned to', async () => {
    const t1 = await h.createUser(admin, 'technician');
    const t2 = await h.createUser(admin, 'technician');
    const mine = await siteWithVisit(h, admin, t1.id);
    const theirs = await siteWithVisit(h, admin, t2.id);
    const list = await h.request({ method: 'GET', url: '/api/v1/visits', token: t1.token });
    const visitIds = list.json<{ items: { id: string }[] }>().items.map((v) => v.id);
    expect(visitIds).toEqual([mine.visitId]);
    expect((await h.request({ method: 'GET', url: `/api/v1/visits/${theirs.visitId}`, token: t1.token })).status).toBe(404);
    // and can only move their own visit forward
    const edit = await h.request({ method: 'PATCH', url: `/api/v1/visits/${mine.visitId}`, token: t1.token, body: { title: 'renamed' } });
    expect(edit.status).toBe(403);
    const start = await h.request({ method: 'PATCH', url: `/api/v1/visits/${mine.visitId}`, token: t1.token, body: { status: 'in_progress' } });
    expect(start.json<{ status: string }>().status).toBe('in_progress');
  });

  it('only technicians/engineers can be assigned to visits', async () => {
    const viewer = await h.createUser(admin, 'viewer');
    const res = await h.request({ method: 'POST', url: '/api/v1/visits', token: admin, body: { siteId: (await h.prisma.site.findFirstOrThrow()).id, title: 'x', technicianIds: [viewer.id] } });
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.code).toBe('INVALID_ASSIGNEE');
  });

  it('validates input with the shared zod schemas', async () => {
    const res = await h.request({ method: 'POST', url: '/api/v1/sites', token: admin, body: { projectId: 'x', code: 'bad code with spaces', name: '' } });
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.code).toBe('VALIDATION_FAILED');
  });

  it('lists are paginated and filterable', async () => {
    const res = await h.request({ method: 'GET', url: '/api/v1/sites?pageSize=2&page=1', token: admin });
    const page = res.json<{ items: unknown[]; total: number; page: number; pageSize: number }>();
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.total).toBeGreaterThanOrEqual(4); // 4 seeded sites
    expect(page).toMatchObject({ page: 1, pageSize: 2 });
    const nasr3 = await h.request({ method: 'GET', url: '/api/v1/sites?q=nasr3', token: admin });
    expect(nasr3.json<{ items: { code: string }[] }>().items.map((s) => s.code)).toContain('nasr3-r21c');
  });
});

describe('health', () => {
  it('reports liveness and readiness without auth', async () => {
    expect((await h.request({ method: 'GET', url: '/health/live' })).status).toBe(200);
    const ready = await h.request({ method: 'GET', url: '/health/ready' });
    expect(ready.status).toBe(200);
    expect(ready.json<{ checks: { database: { status: string }; queue: { driver: string } } }>().checks).toMatchObject({ database: { status: 'up' }, queue: { driver: 'memory' } });
  });
});
