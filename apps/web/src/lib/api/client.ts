/**
 * Browser-side API client. All calls go through the BFF proxy (/api/proxy/*), which holds the
 * tokens in httpOnly cookies, so nothing in this file ever touches a credential.
 */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(params: Record<string, QueryValue> | object | undefined): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, QueryValue>)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue> | object;
  body?: unknown;
  signal?: AbortSignal;
}

let redirectingToLogin = false;

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `/api/proxy${path.startsWith('/') ? path : `/${path}`}${buildQuery(opts.query)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'NETWORK', 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; details?: unknown }; requestId?: string } | null) ?? {};
    if (res.status === 401 && typeof window !== 'undefined' && !redirectingToLogin) {
      redirectingToLogin = true;
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ApiRequestError(res.status, e.error?.code ?? 'HTTP_ERROR', e.error?.message ?? res.statusText, e.error?.details, e.requestId);
  }
  return json as T;
}
