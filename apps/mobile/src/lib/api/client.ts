import type { z } from 'zod';
import type { RemoteOutcome } from '../../features/queue/retry-policy';
import { parseApiError, type AuthSession } from '../../features/auth/session';

export class ApiRequestError extends Error {
  constructor(
    readonly kind: 'network' | 'auth' | 'http' | 'schema',
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type Query = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  /** Abort after this many ms (default 20 s). */
  timeoutMs?: number;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

/**
 * Typed JSON client for /api/v1. Adds the bearer token, refreshes it once on 401 and maps every
 * failure to a RemoteOutcome (for the sync engine) or an ApiRequestError (for screens).
 */
export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly session: AuthSession,
    private readonly fetchFn: FetchLike,
  ) {}

  url(path: string, query?: Query): string {
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return `${this.baseUrl}/api/v1${path}${qs ? `?${qs}` : ''}`;
  }

  async request(path: string, opts: RequestOptions = {}, retried = false): Promise<RemoteOutcome<unknown>> {
    const token = await this.session.accessToken();
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    let res: { status: number; text(): Promise<string> };
    try {
      res = await this.fetchFn(this.url(path, opts.query), {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      return { kind: 'network', message: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    const body = text ? safeJson(text) : null;
    if (res.status === 401 && token && !retried) {
      const r = await this.session.refresh();
      if (r === 'ok') return this.request(path, opts, true);
      if (r === 'auth') return { kind: 'auth', message: 'session expired' };
      return { kind: 'network', message: 'token refresh failed' };
    }
    if (res.status === 401) return { kind: 'auth', message: 'not signed in' };
    if (res.status >= 200 && res.status < 300) return { kind: 'ok', value: body };
    const err = parseApiError(body);
    return { kind: 'http', status: res.status, code: err.code, message: err.message };
  }

  /** Request + schema validation; throws ApiRequestError. */
  async json<S extends z.ZodTypeAny>(schema: S, path: string, opts: RequestOptions = {}): Promise<z.infer<S>> {
    const out = await this.request(path, opts);
    if (out.kind === 'ok') {
      const parsed = schema.safeParse(out.value);
      if (!parsed.success) throw new ApiRequestError('schema', `Unexpected response from ${path}: ${parsed.error.issues[0]?.message ?? ''}`);
      return parsed.data;
    }
    if (out.kind === 'http') throw new ApiRequestError('http', out.message, out.status, out.code);
    throw new ApiRequestError(out.kind, out.message);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
