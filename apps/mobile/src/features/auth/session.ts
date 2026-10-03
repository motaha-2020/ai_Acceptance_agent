import { ApiError } from '@acceptance/shared';
import { ALLOWED_ROLES } from '../../lib/roles';
import { LoginResponse, TokenResponse, type AuthUserDto } from '../../lib/api/schemas';

/** Where the session lives (expo-secure-store on the device = Android Keystore-backed). */
export interface SecretStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface StoredSession {
  accessToken: string;
  /** ms epoch */
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: string;
  user: AuthUserDto;
}

export type LoginResult =
  | { ok: true; user: AuthUserDto }
  | { ok: false; reason: 'invalid' | 'role' | 'rate_limited' | 'network' | 'server' };

export type RefreshResult = 'ok' | 'auth' | 'network';

const KEY = 'auth.session.v1';
/** Who signed in on this phone (id -> name/email, no secrets); kept after logout to name queue owners. */
const KNOWN_USERS_KEY = 'auth.known-users.v1';
const MAX_KNOWN_USERS = 10;

export type KnownUser = Pick<AuthUserDto, 'id' | 'name' | 'email'>;
/** Refresh a little before expiry so an upload never starts with a token about to die. */
const SKEW_MS = 60_000;

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Access + rotating refresh tokens (API: 15-min JWT, refresh token rotated on every use).
 * Refreshes are single-flight: concurrent callers share one rotation, otherwise the second
 * rotation would present an already-revoked token and the server would revoke the whole family.
 */
export class AuthSession {
  private session: StoredSession | null = null;
  private refreshing: Promise<RefreshResult> | null = null;
  private listeners = new Set<(user: AuthUserDto | null) => void>();

  constructor(
    private readonly baseUrl: string,
    private readonly storage: SecretStorage,
    private readonly fetchFn: FetchFn,
    private readonly now: () => number = Date.now,
  ) {}

  get user(): AuthUserDto | null {
    return this.session?.user ?? null;
  }

  subscribe(fn: (user: AuthUserDto | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async restore(): Promise<AuthUserDto | null> {
    const raw = await this.storage.get(KEY).catch(() => null);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as StoredSession;
      if (Date.parse(s.refreshExpiresAt) <= this.now()) {
        await this.clear();
        return null;
      }
      this.session = s;
      this.emit();
      return s.user;
    } catch {
      await this.clear();
      return null;
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    let res: { status: number; json(): Promise<unknown> };
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (res.status === 401) return { ok: false, reason: 'invalid' };
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (res.status !== 200) return { ok: false, reason: 'server' };
    const parsed = LoginResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { ok: false, reason: 'server' };
    const body = parsed.data;
    if (!(ALLOWED_ROLES as readonly string[]).includes(body.user.role)) {
      // Do not keep a session for roles this app is not meant for; revoke it server-side too.
      void this.fetchFn(`${this.baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: body.refreshToken }),
      }).catch(() => undefined);
      return { ok: false, reason: 'role' };
    }
    await this.save({
      accessToken: body.accessToken,
      accessExpiresAt: this.now() + body.accessTokenExpiresIn * 1000,
      refreshToken: body.refreshToken,
      refreshExpiresAt: body.refreshTokenExpiresAt,
      user: body.user,
    });
    await this.rememberUser(body.user);
    return { ok: true, user: body.user };
  }

  /** Accounts that signed in on this phone, most recent first (survives logout and session expiry). */
  async knownUsers(): Promise<KnownUser[]> {
    const raw = await this.storage.get(KNOWN_USERS_KEY).catch(() => null);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw) as unknown;
      return Array.isArray(list) ? (list as KnownUser[]).filter((u) => typeof u?.id === 'string') : [];
    } catch {
      return [];
    }
  }

  private async rememberUser(user: AuthUserDto): Promise<void> {
    const entry: KnownUser = { id: user.id, name: user.name, email: user.email };
    const list = [entry, ...(await this.knownUsers()).filter((u) => u.id !== user.id)].slice(0, MAX_KNOWN_USERS);
    await this.storage.set(KNOWN_USERS_KEY, JSON.stringify(list)).catch(() => undefined);
  }

  /** A valid access token (refreshing if needed), or null when logged out / refresh impossible. */
  async accessToken(): Promise<string | null> {
    if (!this.session) return null;
    if (this.session.accessExpiresAt - SKEW_MS > this.now()) return this.session.accessToken;
    const r = await this.refresh();
    return r === 'ok' ? (this.session?.accessToken ?? null) : r === 'network' ? (this.session?.accessToken ?? null) : null;
  }

  refresh(): Promise<RefreshResult> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async logout(): Promise<void> {
    const token = this.session?.refreshToken;
    await this.clear();
    if (token) {
      await this.fetchFn(`${this.baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      }).catch(() => undefined);
    }
  }

  private async doRefresh(): Promise<RefreshResult> {
    const s = this.session;
    if (!s) return 'auth';
    let res: { status: number; json(): Promise<unknown> };
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken: s.refreshToken }),
      });
    } catch {
      return 'network';
    }
    if (res.status === 401 || res.status === 400) {
      await this.clear();
      return 'auth';
    }
    if (res.status !== 200) return 'network';
    const parsed = TokenResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return 'network';
    await this.save({
      ...s,
      accessToken: parsed.data.accessToken,
      accessExpiresAt: this.now() + parsed.data.accessTokenExpiresIn * 1000,
      refreshToken: parsed.data.refreshToken,
      refreshExpiresAt: parsed.data.refreshTokenExpiresAt,
    });
    return 'ok';
  }

  private async save(s: StoredSession): Promise<void> {
    this.session = s;
    await this.storage.set(KEY, JSON.stringify(s));
    this.emit();
  }

  private async clear(): Promise<void> {
    const had = this.session !== null;
    this.session = null;
    await this.storage.remove(KEY).catch(() => undefined);
    if (had) this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.user);
  }
}

/** Error body helper shared by the API client. */
export function parseApiError(body: unknown): { code?: string; message: string } {
  const parsed = ApiError.safeParse(body);
  return parsed.success ? { code: parsed.data.error.code, message: parsed.data.error.message } : { message: 'Unexpected server response' };
}
