import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, isLocale } from '@/i18n/config';
import { sameOrigin } from '@/lib/server/csrf';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const body = (await req.json().catch(() => null)) as { locale?: unknown } | null;
  if (!isLocale(body?.locale)) return NextResponse.json({ error: 'invalid locale' }, { status: 400 });
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(LOCALE_COOKIE, body.locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
