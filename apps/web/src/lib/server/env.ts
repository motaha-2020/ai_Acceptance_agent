/** Base URL of the API, server side only (never exposed to the browser). */
export function apiBaseUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function cookieSecure(): boolean {
  const v = process.env.COOKIE_SECURE;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV === 'production';
}
