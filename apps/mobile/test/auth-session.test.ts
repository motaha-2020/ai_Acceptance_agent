import { describe, expect, it } from 'vitest';
import { AuthSession, type SecretStorage } from '../src/features/auth/session';

class MemStorage implements SecretStorage {
  m = new Map<string, string>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.m.set(k, v);
  }
  async remove(k: string) {
    this.m.delete(k);
  }
}

const tokens = (n: number) => ({
  accessToken: `access-${n}`,
  accessTokenExpiresIn: 900,
  refreshToken: `refresh-token-${n}-xxxxxxxxxxxxxxxx`,
  refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'Bearer' as const,
});

function fakeServer(role = 'technician') {
  const calls: string[] = [];
  let n = 0;
  let refreshStatus = 200;
  const fetchFn = async (url: string) => {
    const path = url.replace('http://api', '');
    calls.push(path);
    await new Promise((r) => setTimeout(r, 5));
    if (path === '/api/v1/auth/login') return { status: 200, json: async () => ({ ...tokens(++n), user: { id: 'u1', email: 'a@b.c', name: 'Tech', role } }) };
    if (path === '/api/v1/auth/refresh') return { status: refreshStatus, json: async () => tokens(++n) };
    return { status: 204, json: async () => null };
  };
  return { calls, fetchFn, setRefreshStatus: (s: number) => (refreshStatus = s) };
}

describe('auth session', () => {
  it('stores the session securely and restores it', async () => {
    const storage = new MemStorage();
    const srv = fakeServer();
    const s = new AuthSession('http://api', storage, srv.fetchFn);
    expect(await s.login('A@B.C ', 'pw')).toEqual({ ok: true, user: expect.objectContaining({ role: 'technician' }) });
    const s2 = new AuthSession('http://api', storage, srv.fetchFn);
    expect((await s2.restore())?.id).toBe('u1');
    expect(await s2.accessToken()).toBe('access-1');
  });

  it('refuses roles the field app is not for (and revokes the session)', async () => {
    const srv = fakeServer('reviewer');
    const s = new AuthSession('http://api', new MemStorage(), srv.fetchFn);
    expect(await s.login('a@b.c', 'pw')).toEqual({ ok: false, reason: 'role' });
    expect(s.user).toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(srv.calls).toContain('/api/v1/auth/logout');
  });

  it('refreshes once for concurrent callers when the access token is about to expire', async () => {
    let now = 0;
    const srv = fakeServer();
    const s = new AuthSession('http://api', new MemStorage(), srv.fetchFn, () => now);
    await s.login('a@b.c', 'pw');
    now = 900_000 - 30_000; // inside the 60 s skew
    const [a, b, c] = await Promise.all([s.accessToken(), s.accessToken(), s.accessToken()]);
    expect(new Set([a, b, c])).toEqual(new Set(['access-2']));
    expect(srv.calls.filter((p) => p.endsWith('/refresh'))).toHaveLength(1);
  });

  it('clears the session when the refresh token is rejected', async () => {
    let now = 0;
    const srv = fakeServer();
    const s = new AuthSession('http://api', new MemStorage(), srv.fetchFn, () => now);
    const seen: Array<string | null> = [];
    s.subscribe((u) => seen.push(u?.id ?? null));
    await s.login('a@b.c', 'pw');
    srv.setRefreshStatus(401);
    now = 10 * 60_000 * 2;
    expect(await s.refresh()).toBe('auth');
    expect(s.user).toBeNull();
    expect(seen).toEqual(['u1', null]);
  });
});
