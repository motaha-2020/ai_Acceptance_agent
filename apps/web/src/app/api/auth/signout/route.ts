import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookies } from '@/lib/server/tokens';

export const dynamic = 'force-dynamic';

/** Drops the session cookies and goes to the login page (used when the API rejects the session). */
export function GET(req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL('/login', req.nextUrl.origin), 303);
  clearSessionCookies(res);
  return res;
}
