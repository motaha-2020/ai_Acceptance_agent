import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/auth/constants';
import { sameOrigin } from '@/lib/server/csrf';
import { apiBaseUrl } from '@/lib/server/env';
import { clearSessionCookies } from '@/lib/server/tokens';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const rt = req.cookies.get(REFRESH_COOKIE)?.value;
  if (rt) {
    await fetch(`${apiBaseUrl()}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookies(res);
  return res;
}
