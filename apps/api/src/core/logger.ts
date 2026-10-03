import type { LoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';
import type { AppConfig } from '../config/config.js';

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'api' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.refreshToken', '*.accessToken'],
      censor: '[redacted]',
    },
  });
}

/** Routes Nest's internal logging through pino (structured JSON). */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  private split(params: unknown[]): { context?: string; rest: unknown[] } {
    const last = params[params.length - 1];
    return typeof last === 'string' ? { context: last, rest: params.slice(0, -1) } : { rest: params };
  }

  log(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, ...params: unknown[]): void {
    const { context, rest } = this.split(params);
    this.logger.error({ context, trace: rest[0] }, String(message));
  }
  warn(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.trace({ context }, String(message));
  }
}
