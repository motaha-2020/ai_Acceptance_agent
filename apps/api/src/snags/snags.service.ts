import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@acceptance/db';
import type { FixSnagRequest, ListSnagsQuery } from '@acceptance/shared';
import { whereFor } from '../auth/ability.js';
import type { AuthContext } from '../auth/auth.types.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { PRISMA } from '../core/tokens.js';
import { assertPhotoTransition } from '../photos/photo-state.js';
import { nextSnagStatus, photoRollup, type SnagEvent } from './snag-state.js';

type Tx = Prisma.TransactionClient;

const snagInclude = {
  photo: { select: { id: true, status: true, category: true, siteId: true, visitId: true } },
} satisfies Prisma.SnagInclude;

@Injectable()
export class SnagsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(auth: AuthContext, q: ListSnagsQuery) {
    const photo: Prisma.PhotoWhereInput = {
      siteId: q.siteId,
      visitId: q.visitId,
      category: q.category,
      ...(q.projectId ? { site: { projectId: q.projectId } } : {}),
    };
    const where: Prisma.SnagWhereInput = {
      AND: [
        whereFor(auth.ability, 'read', 'Snag'),
        {
          photoId: q.photoId,
          status: q.status,
          source: q.source,
          code: q.code,
          dismissedAt: q.includeDismissed ? undefined : null,
          photo,
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.snag.findMany({ where, include: snagInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...pageArgs(q) }),
      this.prisma.snag.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(auth: AuthContext, id: string) {
    const snag = await this.prisma.snag.findFirst({ where: { AND: [whereFor(auth.ability, 'read', 'Snag'), { id }] }, include: snagInclude });
    if (!snag) throw notFound('Snag', id);
    return snag;
  }

  /** open -> fixed, linking the re-shot photo that shows the fix. */
  async fix(auth: AuthContext, id: string, input: FixSnagRequest) {
    return this.prisma.$transaction(async (tx) => {
      const snag = await tx.snag.findFirst({ where: { AND: [whereFor(auth.ability, 'fix', 'Snag'), { id }] }, include: snagInclude });
      if (!snag) throw notFound('Snag', id);
      const status = nextSnagStatus(snag.status, 'fix', snag.dismissedAt !== null);
      const fixPhoto = await tx.photo.findFirst({ where: { AND: [whereFor(auth.ability, 'read', 'Photo'), { id: input.fixPhotoId }] } });
      if (!fixPhoto) throw notFound('Photo', input.fixPhotoId);
      if (fixPhoto.id === snag.photoId || fixPhoto.siteId !== snag.photo.siteId || fixPhoto.category !== snag.photo.category) {
        throw badRequest('INVALID_FIX_PHOTO', 'The fix photo must be a new photo of the same site and category');
      }
      if (fixPhoto.status === 'rejected') throw conflict('FIX_PHOTO_REJECTED', 'The fix photo itself was rejected');
      await this.apply(tx, id, 'open', { status, fixPhotoId: fixPhoto.id, fixedAt: new Date() });
      await this.rollup(tx, auth, snag.photoId, 'fix');
      return this.reload(tx, id);
    });
  }

  /** fixed -> verified by a reviewer; when every snag of the photo is verified the photo is approved. */
  async verify(auth: AuthContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const snag = await tx.snag.findUnique({ where: { id } });
      if (!snag) throw notFound('Snag', id);
      const status = nextSnagStatus(snag.status, 'verify', snag.dismissedAt !== null);
      await this.apply(tx, id, 'fixed', { status, verifiedAt: new Date(), verifiedById: auth.user.id });
      await this.rollup(tx, auth, snag.photoId, 'verify');
      return this.reload(tx, id);
    });
  }

  /** fixed -> open: the fix was not acceptable. */
  async reopen(auth: AuthContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const snag = await tx.snag.findUnique({ where: { id } });
      if (!snag) throw notFound('Snag', id);
      const status = nextSnagStatus(snag.status, 'reopen', snag.dismissedAt !== null);
      await this.apply(tx, id, 'fixed', { status, fixedAt: null, fixPhotoId: null });
      await this.rollup(tx, auth, snag.photoId, 'reopen');
      return this.reload(tx, id);
    });
  }

  private async apply(tx: Tx, id: string, expected: 'open' | 'fixed', data: Prisma.SnagUncheckedUpdateManyInput): Promise<void> {
    const changed = await tx.snag.updateMany({ where: { id, status: expected, dismissedAt: null }, data });
    if (changed.count === 0) throw conflict('CONCURRENT_UPDATE', 'Snag was changed by someone else; reload and retry');
  }

  /** Propagate snag progress to the photo: rejected -> fixed -> approved, or fixed -> rejected on reopen. */
  private async rollup(tx: Tx, auth: AuthContext, photoId: string, event: SnagEvent): Promise<void> {
    const photo = await tx.photo.findUniqueOrThrow({ where: { id: photoId }, include: { snags: true } });
    const state = photoRollup(photo.snags);
    let next: 'fixed' | 'approved' | 'rejected' | undefined;
    if (event === 'fix' && photo.status === 'rejected' && (state === 'all_fixed_or_verified' || state === 'all_verified')) next = 'fixed';
    if (event === 'verify' && photo.status === 'fixed' && state === 'all_verified') next = 'approved';
    if (event === 'reopen' && photo.status === 'fixed') next = 'rejected';
    if (!next) return;
    assertPhotoTransition(photo.status, next);
    await tx.photo.update({
      where: { id: photoId },
      data: { status: next, ...(next === 'approved' ? { decidedAt: new Date(), decidedById: auth.user.id, rejectionReason: null } : {}) },
    });
  }

  private reload(tx: Tx, id: string) {
    return tx.snag.findUniqueOrThrow({ where: { id }, include: snagInclude });
  }
}
