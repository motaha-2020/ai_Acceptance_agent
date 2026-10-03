export const ACCESS_COOKIE = 'acc_at';
export const REFRESH_COOKIE = 'acc_rt';

export interface TokenClaims {
  sub: string;
  role: string;
  exp: number;
}

/** Decodes (does NOT verify) a JWT payload. Safe in the edge runtime; the API verifies on every call. */
export function decodeClaims(token: string | undefined): TokenClaims | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const data = JSON.parse(json) as Partial<TokenClaims>;
    if (typeof data.sub !== 'string' || typeof data.role !== 'string' || typeof data.exp !== 'number') return null;
    return { sub: data.sub, role: data.role, exp: data.exp };
  } catch {
    return null;
  }
}

export function isFresh(claims: TokenClaims | null, skewSeconds = 20): boolean {
  return !!claims && claims.exp * 1000 > Date.now() + skewSeconds * 1000;
}

/** Only same-origin relative paths are allowed as post-login targets (open-redirect guard). */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.startsWith('/api/')) return fallback;
  return value;
}
