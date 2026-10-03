import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, decodeClaims, isFresh } from '@/lib/auth/constants';
import { sameOrigin } from '@/lib/server/csrf';
import { apiBaseUrl } from '@/lib/server/env';
import { clearSessionCookies, refreshTokens, setSessionCookies, type Tokens } from '@/lib/server/tokens';

export const dynamic = 'force-dynamic';

const BLOCKED = /^auth\/(login|refresh|logout)(\/|$)/;
const FORWARD_HEADERS = ['content-type', 'accept', 'accept-language', 'x-request-id'];

/**
 * Backend-for-frontend proxy: /api/proxy/<path> -> API /api/v1/<path>.
 * Attaches the bearer token from the httpOnly cookie, refreshes it when needed (single-flight)
 * and keeps tokens out of the browser's JavaScript entirely.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path } = await ctx.params;
  const joined = path.join('/');
  if (path.some((p) => p === '..' || p === '.' || p === '') || BLOCKED.test(joined)) {
    return NextResponse.json({ statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
    return NextResponse.json({ statusCode: 403, error: { code: 'CSRF', message: 'Cross-origin request blocked' } }, { status: 403 });
  }

  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let rotated: Tokens | null = null;
  if (!isFresh(decodeClaims(access)) && refresh) {
    rotated = await refreshTokens(refresh);
    if (rotated) access = rotated.accessToken;
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();
  const url = `${apiBaseUrl()}/api/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  const call = (token: string | undefined): Promise<Response> => {
    const h = new Headers(headers);
    if (token) h.set('authorization', `Bearer ${token}`);
    return fetch(url, { method, headers: h, body, cache: 'no-store', redirect: 'manual' });
  };

  let upstream: Response;
  try {
    upstream = await call(access);
    if (upstream.status === 401 && refresh && !rotated) {
      const again = await refreshTokens(refresh);
      if (again) {
        rotated = again;
        upstream = await call(again.accessToken);
      }
    }
  } catch {
    return NextResponse.json({ statusCode: 502, error: { code: 'API_UNREACHABLE', message: 'API is unreachable' } }, { status: 502 });
  }

  const res = new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status });
  const ct = upstream.headers.get('content-type');
  if (ct) res.headers.set('content-type', ct);
  res.headers.set('cache-control', 'no-store');
  if (rotated) setSessionCookies(res, rotated);
  else if (upstream.status === 401 && refresh) clearSessionCookies(res);
  return res;
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
