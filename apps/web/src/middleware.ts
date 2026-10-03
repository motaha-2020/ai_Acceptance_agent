import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, decodeClaims, isFresh } from '@/lib/auth/constants';

/**
 * Gate for all pages (API routes are excluded by the matcher and enforce auth themselves).
 * - no session cookies          -> /login?next=...
 * - access cookie gone/expired  -> /api/auth/refresh (rotates tokens, comes back)
 * - signed in on /login         -> /
 * Authorization (roles) is enforced by the API; the UI only hides what a role cannot do.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const fresh = isFresh(decodeClaims(access));
  const isLogin = pathname === '/login';

  if (isLogin) {
    if (fresh) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }
  if (fresh) return NextResponse.next();

  const target = `${pathname}${search}`;
  if (refresh) {
    const url = new URL('/api/auth/refresh', req.url);
    url.searchParams.set('next', target);
    return NextResponse.redirect(url);
  }
  const url = new URL('/login', req.url);
  if (target !== '/') url.searchParams.set('next', target);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon|icon|.*\\.[a-zA-Z0-9]+$).*)'],
};
