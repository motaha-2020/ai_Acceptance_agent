import { HttpException, Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { catchError, from, mergeMap, throwError, type Observable } from 'rxjs';
import { DomainError } from '../core/errors.js';
import { AUDIT, type AuditMeta } from './audit.decorator.js';
import { AuditService } from './audit.service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Nest stores @HttpCode() under this metadata key. */
const HTTP_CODE_METADATA = '__httpCode__';

function errorStatus(err: unknown): number {
  if (err instanceof DomainError) return err.status;
  if (err instanceof HttpException) return err.getStatus();
  const s = (err as { statusCode?: unknown })?.statusCode;
  return typeof s === 'number' ? s : 500;
}

function errorCode(err: unknown): string {
  if (err instanceof DomainError) return err.code;
  return (err as { name?: string })?.name ?? 'Error';
}

/**
 * Global interceptor: every mutating request (success or failure) becomes an AuditLog row with
 * actor, action, entity id, `before` snapshot (for @Audited routes) and redacted `after` response.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!MUTATING.has(req.method)) return next.handle();

    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT, ctx.getHandler());
    const params = (req.params ?? {}) as Record<string, string | undefined>;
    const paramId = params[meta?.idParam ?? 'id'];
    const action = `${meta?.entity ?? ctx.getClass().name.replace(/Controller$/, '')}.${ctx.getHandler().name}`;
    const successStatus = this.reflector.get<number | undefined>(HTTP_CODE_METADATA, ctx.getHandler()) ?? (req.method === 'POST' ? 201 : 200);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const captured = meta?.captureBody?.length ? Object.fromEntries(meta.captureBody.map((k) => [k, body[k]])) : undefined;

    const base = () => ({
      actorId: req.auth?.user.id ?? null,
      actorRole: req.auth?.user.role ?? null,
      action,
      method: req.method,
      path: req.url,
      entity: meta?.entity ?? null,
      requestId: String(req.id),
      ip: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    });

    const before$ = meta && paramId ? this.audit.snapshot(meta.entity, paramId).catch(() => null) : Promise.resolve(null);
    return from(before$).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          mergeMap(async (result: unknown) => {
            const resultId = (result as { id?: unknown } | null)?.id;
            await this.audit.record({
              ...base(),
              entityId: paramId ?? (typeof resultId === 'string' ? resultId : null),
              before,
              after: captured ? { ...captured, result } : result,
              statusCode: successStatus,
            });
            return result;
          }),
          catchError((err: unknown) =>
            from(
              this.audit.record({
                ...base(),
                entityId: paramId ?? null,
                before,
                after: { ...(captured ?? {}), error: errorCode(err) },
                statusCode: errorStatus(err),
              }),
            ).pipe(mergeMap(() => throwError(() => err))),
          ),
        ),
      ),
    );
  }
}
