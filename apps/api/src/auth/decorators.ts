import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Action } from '@acceptance/shared';
import { unauthorized } from '../core/errors.js';
import type { AppSubject } from './ability.js';
import type { AuthContext, ClientMeta } from './auth.types.js';

export const IS_PUBLIC = 'auth:public';
export const POLICY = 'auth:policy';

export interface PolicyRequirement {
  action: Action;
  subject: AppSubject;
}

/** Route needs no authentication. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Coarse permission check done by the AccessGuard before the handler runs
 * ("may this role ever do X on Y?"). Row-level scoping happens in services via `whereFor`.
 */
export const CheckPolicy = (action: Action, subject: AppSubject): MethodDecorator & ClassDecorator =>
  SetMetadata(POLICY, { action, subject } satisfies PolicyRequirement);

/** Injects the authenticated user and their CASL ability. */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!req.auth) throw unauthorized();
  return req.auth;
});

export const Client = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientMeta => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua.slice(0, 300) : undefined };
});
