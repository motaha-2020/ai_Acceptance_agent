import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE, safeNext } from '@/lib/auth/constants';
import { clearSessionCookies, refreshTokens, setSessionCookies } from '@/lib/server/tokens';

export const dynamic = 'force-dynamic';

/**
 * Navigation-time refresh: middleware sends users here when the access cookie expired.
 * Rotates the refresh token, sets new cookies and returns to the page they asked for.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const rt = req.cookies.get(REFRESH_COOKIE)?.value;
  const tokens = rt ? await refreshTokens(rt) : null;
  if (!tokens) {
    const login = new URL('/login', req.nextUrl.origin);
    if (next !== '/') login.searchParams.set('next', next);
    const res = NextResponse.redirect(login, 303);
    clearSessionCookies(res);
    return res;
  }
  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin), 303);
  setSessionCookies(res, tokens);
  return res;
}
