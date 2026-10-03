import { Inject, Injectable } from '@nestjs/common';
import { hashPassword, needsRehash, verifyPassword, type PrismaClient } from '@acceptance/db';
import type { LoginRequest, TokenResponse } from '@acceptance/shared';
import type { AppConfig } from '../config/config.js';
import { unauthorized } from '../core/errors.js';
import { CONFIG, PRISMA } from '../core/tokens.js';
import { defineAbilityFor } from './ability.js';
import type { AuthContext, AuthUser, ClientMeta } from './auth.types.js';
import { LoginRateLimiter } from './rate-limiter.js';
import { TokenService } from './token.service.js';

/** Attempts per IP and window across all emails (credential stuffing). */
const LOGIN_ATTEMPTS_PER_IP = 20;

/** Hash used when the email is unknown so failed logins take the same time either way. */
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService {
  private readonly limiter: LoginRateLimiter;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.limiter = new LoginRateLimiter(config.LOGIN_RATE_LIMIT_MAX, config.LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000);
  }

  async login(input: LoginRequest, meta: ClientMeta): Promise<TokenResponse & { user: AuthUser }> {
    const ip = meta.ip ?? 'unknown';
    const key = `${ip}|${input.email}`;
    this.limiter.hit(key);
    this.limiter.hit(`ip|${ip}`, LOGIN_ATTEMPTS_PER_IP);

    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: { role: true } });
    dummyHash ??= hashPassword('not-a-real-password-for-timing');
    const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash), input.password);
    if (!user || !ok || !user.isActive) throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');

    this.limiter.reset(key);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(input.password) } : {}) },
    });
    const pair = await this.tokens.issue({ id: user.id, role: user.role.name }, meta);
    return { ...pair, user: { id: user.id, email: user.email, name: user.name, role: user.role.name } };
  }

  refresh(refreshToken: string, meta: ClientMeta): Promise<TokenResponse> {
    return this.tokens.rotate(refreshToken, meta);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  /** Resolve a bearer token into the request auth context (user must still exist and be active). */
  async authenticate(accessToken: string): Promise<AuthContext> {
    const claims = await this.tokens.verifyAccess(accessToken);
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub }, include: { role: true } });
    if (!user || !user.isActive) throw unauthorized('INVALID_TOKEN', 'User is not active');
    const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role.name };
    return { user: authUser, ability: defineAbilityFor(authUser) };
  }

}
