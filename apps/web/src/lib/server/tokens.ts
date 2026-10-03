import type { NextResponse } from 'next/server';
import type { TokenResponse } from '@acceptance/shared';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/constants';
import { apiBaseUrl, cookieSecure } from './env';

export type Tokens = Pick<TokenResponse, 'accessToken' | 'accessTokenExpiresIn' | 'refreshToken' | 'refreshTokenExpiresAt'>;

export function setSessionCookies(res: NextResponse, t: Tokens): void {
  const secure = cookieSecure();
  res.cookies.set(ACCESS_COOKIE, t.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(1, t.accessTokenExpiresIn),
  });
  res.cookies.set(REFRESH_COOKIE, t.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: new Date(t.refreshTokenExpiresAt),
  });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { path: '/', maxAge: 0 });
}

interface Flight {
  promise: Promise<Tokens | null>;
}
const g = globalThis as unknown as { __refreshFlights?: Map<string, Flight>; __refreshDone?: Map<string, { at: number; tokens: Tokens | null }> };
const flights = (g.__refreshFlights ??= new Map());
const done = (g.__refreshDone ??= new Map());
const REUSE_MS = 15_000;

/**
 * Rotates a refresh token. The API revokes the whole token family when a rotated token is
 * presented again, so concurrent requests carrying the same old token must share ONE refresh
 * call (single-flight) and reuse its result for a few seconds.
 */
export function refreshTokens(refreshToken: string): Promise<Tokens | null> {
  const recent = done.get(refreshToken);
  if (recent && Date.now() - recent.at < REUSE_MS) return Promise.resolve(recent.tokens);
  const existing = flights.get(refreshToken);
  if (existing) return existing.promise;
  const promise = (async (): Promise<Tokens | null> => {
    try {
      const res = await fetch(`${apiBaseUrl()}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as Tokens;
    } catch {
      return null;
    }
  })().then((tokens) => {
    done.set(refreshToken, { at: Date.now(), tokens });
    flights.delete(refreshToken);
    for (const [k, v] of done) if (Date.now() - v.at > REUSE_MS * 2) done.delete(k);
    return tokens;
  });
  flights.set(refreshToken, { promise });
  return promise;
}
