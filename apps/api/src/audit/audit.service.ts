import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { Prisma, type PrismaClient } from '@acceptance/db';
import type { ListAuditLogsQuery } from '@acceptance/shared';
import { pageArgs, toPage } from '../core/pagination.js';
import { LOGGER, PRISMA } from '../core/tokens.js';
import { userSelect } from '../users/users.service.js';
import type { AuditEntity } from './audit.decorator.js';

const SECRET_KEY = /pass(word)?|token|secret|hash|authorization|cookie/i;
const MAX_JSON_BYTES = 32 * 1024;

/** Deep copy without secret-looking keys; large payloads are replaced by a marker. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 8) return '[depth]';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  const clean = redact(value);
  const text = JSON.stringify(clean);
  if (text.length > MAX_JSON_BYTES) return { truncated: true, bytes: text.length };
  return clean as Prisma.InputJsonValue;
}

export interface AuditRecord {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  method: string;
  path: string;
  entity?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  statusCode: number;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Current state of an entity for the `before` column. */
  async snapshot(entity: AuditEntity, id: string): Promise<unknown> {
    switch (entity) {
      case 'User':
        return this.prisma.user.findUnique({ where: { id }, select: userSelect });
      case 'Project':
        return this.prisma.project.findUnique({ where: { id } });
      case 'Site':
        return this.prisma.site.findUnique({ where: { id } });
      case 'Device':
        return this.prisma.device.findUnique({ where: { id } });
      case 'Visit':
        return this.prisma.visit.findUnique({ where: { id }, include: { assignments: { select: { userId: true } } } });
      case 'Photo':
        return this.prisma.photo.findUnique({ where: { id }, omit: { exif: true } });
      case 'Snag':
        return this.prisma.snag.findUnique({ where: { id } });
      default:
        return null;
    }
  }

  /** Never throws: an audit failure is logged loudly but does not fail the user's request. */
  async record(r: AuditRecord): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: r.actorId ?? null,
          actorRole: r.actorRole ?? null,
          action: r.action.slice(0, 200),
          method: r.method,
          path: r.path.slice(0, 500),
          entity: r.entity ?? null,
          entityId: r.entityId ?? null,
          before: toJson(r.before),
          after: toJson(r.after),
          statusCode: r.statusCode,
          requestId: r.requestId ?? null,
          ip: r.ip ?? null,
          userAgent: r.userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (err) {
      this.logger.error({ err, action: r.action, path: r.path }, 'AUDIT WRITE FAILED');
    }
  }

  async list(q: ListAuditLogsQuery) {
    const where: Prisma.AuditLogWhereInput = {
      entity: q.entity,
      entityId: q.entityId,
      actorId: q.actorId,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, ...pageArgs(q) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return toPage(rows.map((r) => ({ ...r, id: r.id.toString() })), total, q);
  }
}
