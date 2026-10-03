import type { NextRequest } from 'next/server';

/**
 * CSRF guard for state-changing BFF calls. Cookies are SameSite=Lax already; this additionally
 * requires the Origin (when sent) to match the host the request was addressed to.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get('sec-fetch-site');
  return !site || site === 'same-origin' || site === 'none';
}
