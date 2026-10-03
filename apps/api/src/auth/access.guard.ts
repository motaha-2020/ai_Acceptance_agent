import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../core/errors.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC, POLICY, type PolicyRequirement } from './decorators.js';

/**
 * Global guard: authenticates the bearer token (unless @Public) and enforces @CheckPolicy.
 * Deny by default: a non-public route without a policy is still authenticated.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match?.[1]) throw unauthorized();
    req.auth = await this.auth.authenticate(match[1]);

    const policy = this.reflector.getAllAndOverride<PolicyRequirement | undefined>(POLICY, targets);
    if (policy && !req.auth.ability.can(policy.action, policy.subject)) throw forbidden();
    return true;
  }
}
