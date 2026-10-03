import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '@acceptance/db';
import { Role, type TokenResponse } from '@acceptance/shared';
import { z } from 'zod';
import type { AppConfig } from '../config/config.js';
import { unauthorized } from '../core/errors.js';
import { CONFIG, PRISMA } from '../core/tokens.js';
import type { ClientMeta } from './auth.types.js';

const AccessClaims = z.object({ sub: z.string(), role: Role, typ: z.literal('access') });
export type AccessClaims = z.infer<typeof AccessClaims>;

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Short-lived JWT access tokens + opaque rotating refresh tokens.
 * Refresh tokens are stored as SHA-256 hashes; every rotation revokes the presented token.
 * Presenting an already-revoked token is treated as theft: the whole token family is revoked.
 */
@Injectable()
export class TokenService {
  private readonly jwt: JwtService;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {
    this.jwt = new JwtService({
      secret: config.JWT_ACCESS_SECRET,
      signOptions: { algorithm: 'HS256', expiresIn: config.ACCESS_TOKEN_TTL_SECONDS, issuer: config.JWT_ISSUER },
      verifyOptions: { algorithms: ['HS256'], issuer: config.JWT_ISSUER },
    });
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      return AccessClaims.parse(await this.jwt.verifyAsync<object>(token));
    } catch {
      throw unauthorized('INVALID_TOKEN', 'Invalid or expired access token');
    }
  }

  async issue(user: { id: string; role: Role }, meta: ClientMeta, familyId: string = randomUUID()): Promise<TokenResponse> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, typ: 'access' });
    const { token, expiresAt } = await this.createRefresh(user.id, familyId, meta);
    return {
      accessToken,
      accessTokenExpiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: token,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      tokenType: 'Bearer',
    };
  }

  /** Rotate a refresh token. Returns the new token pair. */
  async rotate(refreshToken: string, meta: ClientMeta): Promise<TokenResponse> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { include: { role: true } } },
    });
    if (!row) throw unauthorized('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw unauthorized('REFRESH_TOKEN_REUSED', 'Refresh token was already used; all sessions of this login were revoked');
    }
    if (row.expiresAt <= new Date() || !row.user.isActive) {
      throw unauthorized('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }
    // Compare-and-set so two concurrent refreshes of the same token cannot both succeed.
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count === 0) {
      await this.revokeFamily(row.familyId);
      throw unauthorized('REFRESH_TOKEN_REUSED', 'Refresh token was already used; all sessions of this login were revoked');
    }
    const pair = await this.issue({ id: row.userId, role: row.user.role.name }, meta, row.familyId);
    const next = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(pair.refreshToken) }, select: { id: true } });
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { replacedById: next?.id ?? null } });
    return pair;
  }

  /** Logout: revoke the family of the presented token (no error when unknown, to avoid probing). */
  async revoke(refreshToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async createRefresh(userId: string, familyId: string, meta: ClientMeta): Promise<{ token: string; expiresAt: Date }> {
    const token = `rt_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null },
    });
    return { token, expiresAt };
  }
}
