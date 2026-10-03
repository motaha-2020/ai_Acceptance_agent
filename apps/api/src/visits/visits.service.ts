import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@acceptance/db';
import type { AssignTechniciansRequest, CreateVisitRequest, ListVisitsQuery, UpdateVisitRequest, VisitStatus } from '@acceptance/shared';
import { whereFor } from '../auth/ability.js';
import type { AuthContext } from '../auth/auth.types.js';
import { badRequest, forbidden, invalidTransition, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { PRISMA } from '../core/tokens.js';

export const visitInclude = {
  site: { select: { id: true, code: true, name: true, projectId: true } },
  assignments: { select: { assignedAt: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { assignedAt: 'asc' } },
  _count: { select: { photos: true } },
} satisfies Prisma.VisitInclude;

/** Allowed visit status changes. */
export const VISIT_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['in_progress', 'closed'],
  closed: [],
  cancelled: [],
};

/** Roles that can be assigned to a visit. */
const ASSIGNABLE_ROLES = ['technician', 'engineer'] as const;

@Injectable()
export class VisitsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(auth: AuthContext, q: ListVisitsQuery) {
    const where: Prisma.VisitWhereInput = {
      AND: [
        whereFor(auth.ability, 'read', 'Visit'),
        {
          siteId: q.siteId,
          status: q.status,
          ...(q.projectId ? { site: { projectId: q.projectId } } : {}),
          ...(q.technicianId ? { assignments: { some: { userId: q.technicianId } } } : {}),
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({ where, include: visitInclude, orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }], ...pageArgs(q) }),
      this.prisma.visit.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(auth: AuthContext, id: string) {
    const visit = await this.prisma.visit.findFirst({ where: { AND: [whereFor(auth.ability, 'read', 'Visit'), { id }] }, include: visitInclude });
    if (!visit) throw notFound('Visit', id);
    return visit;
  }

  async create(auth: AuthContext, input: CreateVisitRequest) {
    const site = await this.prisma.site.findUnique({ where: { id: input.siteId } });
    if (!site || site.archivedAt) throw badRequest('INVALID_SITE', 'Site does not exist or is archived');
    const technicianIds = [...new Set(input.technicianIds)];
    await this.assertAssignable(technicianIds);
    return this.prisma.visit.create({
      data: {
        siteId: input.siteId,
        title: input.title,
        type: input.type,
        scheduledFor: input.scheduledFor ?? null,
        notes: input.notes ?? null,
        createdById: auth.user.id,
        assignments: { create: technicianIds.map((userId) => ({ userId, assignedById: auth.user.id })) },
      },
      include: visitInclude,
    });
  }

  async update(auth: AuthContext, id: string, input: UpdateVisitRequest) {
    const visit = await this.prisma.visit.findFirst({ where: { AND: [whereFor(auth.ability, 'update', 'Visit'), { id }] } });
    if (!visit) throw notFound('Visit', id);
    if (auth.user.role === 'technician') {
      // Field users only move their own visit forward; planning fields belong to the office.
      const keys = Object.keys(input).filter((k) => input[k as keyof UpdateVisitRequest] !== undefined);
      if (keys.some((k) => k !== 'status') || (input.status && !['in_progress', 'submitted'].includes(input.status))) {
        throw forbidden('Technicians can only start or submit their visits');
      }
    }
    if (input.status && input.status !== visit.status && !VISIT_TRANSITIONS[visit.status].includes(input.status)) {
      throw invalidTransition('Visit', visit.status, input.status);
    }
    const now = new Date();
    return this.prisma.visit.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === 'in_progress' && !visit.startedAt ? { startedAt: now } : {}),
        ...(input.status === 'closed' ? { completedAt: now } : {}),
      },
      include: visitInclude,
    });
  }

  async assign(auth: AuthContext, id: string, input: AssignTechniciansRequest) {
    const visit = await this.prisma.visit.findUnique({ where: { id } });
    if (!visit) throw notFound('Visit', id);
    if (visit.status === 'closed' || visit.status === 'cancelled') throw invalidTransition('Visit', visit.status, 'assignment change');
    const userIds = [...new Set(input.userIds)];
    await this.assertAssignable(userIds);
    await this.prisma.visitAssignment.createMany({
      data: userIds.map((userId) => ({ visitId: id, userId, assignedById: auth.user.id })),
      skipDuplicates: true,
    });
    return this.get(auth, id);
  }

  async unassign(auth: AuthContext, id: string, userId: string) {
    const deleted = await this.prisma.visitAssignment.deleteMany({ where: { visitId: id, userId } });
    if (deleted.count === 0) throw notFound('Assignment');
    return this.get(auth, id);
  }

  private async assertAssignable(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true, role: { name: { in: [...ASSIGNABLE_ROLES] } } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      const ok = new Set(users.map((u) => u.id));
      throw badRequest('INVALID_ASSIGNEE', 'Only active technicians or engineers can be assigned', { invalid: userIds.filter((u) => !ok.has(u)) });
    }
  }
}
