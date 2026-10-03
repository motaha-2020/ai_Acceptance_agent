import { NextResponse, type NextRequest } from 'next/server';
import { LoginRequest, type TokenResponse } from '@acceptance/shared';
import { sameOrigin } from '@/lib/server/csrf';
import { apiBaseUrl } from '@/lib/server/env';
import { setSessionCookies } from '@/lib/server/tokens';

export const dynamic = 'force-dynamic';

/** BFF login: the browser never sees the tokens; they are stored in httpOnly cookies. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(req)) return NextResponse.json({ error: { code: 'CSRF', message: 'Cross-origin request blocked' } }, { status: 403 });
  const parsed = LoginRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid email or password format' } }, { status: 400 });
  }
  const upstream = await fetch(`${apiBaseUrl()}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
      'user-agent': req.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ error: { code: 'API_UNREACHABLE', message: 'API is unreachable' } }, { status: 502 });
  if (!upstream.ok) {
    const body = (await upstream.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    return NextResponse.json({ error: body?.error ?? { code: 'LOGIN_FAILED', message: 'Login failed' } }, { status: upstream.status });
  }
  const tokens = (await upstream.json()) as TokenResponse;
  const res = NextResponse.json({ ok: true });
  setSessionCookies(res, tokens);
  return res;
}
