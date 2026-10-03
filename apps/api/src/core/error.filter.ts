import { ForbiddenError } from '@casl/ability';
import { Catch, HttpException, HttpStatus, Inject, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { Prisma } from '@acceptance/db';
import type { ApiError } from '@acceptance/shared';
import { DomainError } from './errors.js';
import { LOGGER } from './tokens.js';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

interface Mapped {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  headers?: Record<string, string>;
}

/** Consistent error body for every failure; 5xx details are logged, never returned. */
@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const m = this.map(exception);
    if (m.status >= 500) {
      this.logger.error({ err: exception, reqId: request.id, url: request.url }, 'unhandled error');
    }
    const body: ApiError = {
      statusCode: m.status,
      error: { code: m.code, message: m.message, ...(m.details !== undefined ? { details: m.details } : {}) },
      requestId: String(request.id),
    };
    if (m.headers) void reply.headers(m.headers);
    void reply.status(m.status).send(body);
  }

  private map(e: unknown): Mapped {
    if (e instanceof DomainError) return { status: e.status, code: e.code, message: e.message, details: e.details };
    if (e instanceof ZodError) {
      return { status: 400, code: 'VALIDATION_FAILED', message: 'Request validation failed', details: e.issues };
    }
    if (e instanceof ForbiddenError) return { status: 403, code: 'FORBIDDEN', message: 'You are not allowed to perform this action' };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, code: 'CONFLICT', message: 'A record with the same unique value already exists', details: { target: e.meta?.target } };
      if (e.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
      if (e.code === 'P2003') return { status: 409, code: 'CONFLICT', message: 'Related record constraint failed' };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const res = e.getResponse();
      const message = typeof res === 'string' ? res : ((res as { message?: unknown }).message ?? e.message);
      return { status, code: STATUS_CODES[status] ?? `HTTP_${status}`, message: Array.isArray(message) ? message.join('; ') : String(message) };
    }
    // Fastify / plugin errors carry statusCode (e.g. FST_REQ_FILE_TOO_LARGE -> 413).
    const fe = e as { statusCode?: unknown; code?: unknown; message?: unknown };
    if (typeof fe?.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
      return { status: fe.statusCode, code: STATUS_CODES[fe.statusCode] ?? String(fe.code ?? 'BAD_REQUEST'), message: String(fe.message ?? 'Bad request') };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL', message: 'Internal server error' };
  }
}
