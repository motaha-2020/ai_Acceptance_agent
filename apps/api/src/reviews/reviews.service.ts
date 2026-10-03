import { Inject, Injectable } from '@nestjs/common';
import { getSnag } from '@acceptance/checklist';
import { Prisma, type Analysis, type PhotoCategory, type PhotoStatus, type PrismaClient, type Snag } from '@acceptance/db';
import type { ReviewQueueQuery, SubmitReviewRequest } from '@acceptance/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { PRISMA } from '../core/tokens.js';
import { PhotoPresenter } from '../photos/photo-presenter.js';
import { assertPhotoTransition, REVIEWABLE } from '../photos/photo-state.js';
import { canDismiss } from '../snags/snag-state.js';

type Tx = Prisma.TransactionClient;
type HumanVerdict = 'accept' | 'reject';

const latestAnalysis = { where: { status: 'succeeded' }, orderBy: { createdAt: 'desc' }, take: 1 } satisfies Prisma.Photo$analysesArgs;

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PhotoPresenter) private readonly presenter: PhotoPresenter,
  ) {}

  /** Photos waiting for a human, oldest first (FIFO keeps turnaround fair across sites). */
  async queue(q: ReviewQueueQuery) {
    const where: Prisma.PhotoWhereInput = {
      status: q.status,
      category: q.category,
      siteId: q.siteId,
      ...(q.projectId ? { site: { projectId: q.projectId } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.photo.findMany({
        where,
        orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
        include: {
          analyses: latestAnalysis,
          snags: { where: { dismissedAt: null }, orderBy: { createdAt: 'asc' } },
          site: { select: { id: true, code: true, name: true, projectId: true } },
          visit: { select: { id: true, title: true } },
        },
        ...pageArgs(q),
      }),
      this.prisma.photo.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async ({ analyses, snags, site, visit, ...photo }) => ({
        ...(await this.presenter.present(photo)),
        site,
        visit,
        analysis: analyses[0] ?? null,
        snags,
      })),
    );
    return toPage(items, total, q);
  }

  /**
   * Record a reviewer decision (immutable training label) and apply its snag edits:
   * removed snags are dismissed (kept as negative labels), added snags are created as `human`.
   */
  async submit(auth: AuthContext, photoId: string, input: SubmitReviewRequest) {
    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.photo.findUnique({ where: { id: photoId }, include: { analyses: latestAnalysis, snags: true } });
      if (!photo) throw notFound('Photo', photoId);
      if (!REVIEWABLE.includes(photo.status)) throw conflict('NOT_REVIEWABLE', `Photo is ${photo.status}; only ${REVIEWABLE.join('/')} photos can be reviewed`);
      const analysis = photo.analyses[0] ?? null;
      const verdict = this.resolveVerdict(input, analysis);

      const byId = new Map(photo.snags.map((s) => [s.id, s]));
      const removed: Snag[] = [];
      for (const id of new Set(input.removeSnagIds)) {
        const snag = byId.get(id);
        if (!snag) throw badRequest('UNKNOWN_SNAG', `Snag ${id} does not belong to photo ${photoId}`);
        if (!canDismiss(snag.status, snag.dismissedAt !== null)) throw conflict('SNAG_NOT_DISMISSABLE', `Snag ${id} is ${snag.status}${snag.dismissedAt ? ' (dismissed)' : ''}`);
        removed.push(snag);
      }
      const now = new Date();
      if (removed.length) {
        await tx.snag.updateMany({ where: { id: { in: removed.map((s) => s.id) } }, data: { dismissedAt: now, dismissedById: auth.user.id } });
      }
      const added = [];
      for (const s of input.addSnags) {
        const def = getSnag(s.code);
        if (!def) throw badRequest('UNKNOWN_SNAG_CODE', `Snag code ${s.code} is not in the taxonomy`);
        added.push(
          await tx.snag.create({
            data: {
              photoId,
              code: s.code,
              severity: s.severity ?? def.defaultSeverity,
              bbox: s.bbox ? (s.bbox as Prisma.InputJsonValue) : Prisma.JsonNull,
              textAr: s.textAr ?? def.titleAr,
              textEn: s.textEn ?? def.titleEn,
              source: 'human',
              createdById: auth.user.id,
            },
          }),
        );
      }
      const removedIds = new Set(removed.map((s) => s.id));
      const kept = photo.snags.filter((s) => !s.dismissedAt && !removedIds.has(s.id));
      const review = await tx.review.create({
        data: {
          photoId,
          reviewerId: auth.user.id,
          analysisId: analysis?.id ?? null,
          decision: input.decision,
          verdict,
          aiVerdict: analysis?.verdict ?? null,
          category: photo.category,
          reason: input.reason ?? null,
          payload: {
            addedSnagIds: added.map((s) => s.id),
            removedSnagIds: removed.map((s) => s.id),
            addedCodes: added.map((s) => s.code),
            removedCodes: removed.map((s) => s.code),
            keptCodes: kept.map((s) => s.code),
          },
        },
      });
      return { review, addedSnags: added, dismissedSnagIds: [...removedIds] };
    });
  }

  async approve(auth: AuthContext, photoId: string) {
    return this.prisma.$transaction(async (tx) => {
      const photo = await this.loadForDecision(tx, photoId);
      assertPhotoTransition(photo.status, 'approved');
      const blocking = photo.snags.filter((s) => !s.dismissedAt && s.status !== 'verified');
      if (blocking.length) {
        throw conflict('OPEN_SNAGS', `Photo has ${blocking.length} unresolved snag(s); dismiss them in a review or reject the photo`, {
          snagIds: blocking.map((s) => s.id),
        });
      }
      await this.ensureLabel(tx, auth, photo, 'accept');
      return this.decide(tx, auth, photo.id, photo.status, { status: 'approved', rejectionReason: null });
    });
  }

  async reject(auth: AuthContext, photoId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const photo = await this.loadForDecision(tx, photoId);
      assertPhotoTransition(photo.status, 'rejected');
      await this.ensureLabel(tx, auth, photo, 'reject', reason);
      if (photo.status === 'fixed') {
        // The re-shots were not good enough: their snags go back to the technician.
        await tx.snag.updateMany({ where: { photoId, status: 'fixed', dismissedAt: null }, data: { status: 'open', fixedAt: null, fixPhotoId: null } });
      }
      return this.decide(tx, auth, photo.id, photo.status, { status: 'rejected', rejectionReason: reason });
    });
  }

  private resolveVerdict(input: SubmitReviewRequest, analysis: Analysis | null): HumanVerdict {
    if (input.decision === 'agree') {
      if (!analysis?.verdict) throw badRequest('NO_AI_RESULT', 'There is no AI result to agree with; use override');
      if (analysis.verdict === 'uncertain') throw badRequest('AI_UNCERTAIN', 'AI was uncertain; use override with a verdict');
      if (input.verdict && input.verdict !== analysis.verdict) throw badRequest('VERDICT_MISMATCH', 'agree must keep the AI verdict; use override');
      return analysis.verdict;
    }
    if (input.decision === 'override') {
      if (!input.verdict) throw badRequest('VALIDATION_FAILED', 'override requires a verdict');
      return input.verdict;
    }
    return input.verdict ?? 'reject'; // add_snag: missed defects normally mean reject
  }

  private async loadForDecision(tx: Tx, photoId: string) {
    const photo = await tx.photo.findUnique({ where: { id: photoId }, include: { snags: true, analyses: latestAnalysis } });
    if (!photo) throw notFound('Photo', photoId);
    return photo;
  }

  /**
   * Approving/rejecting always leaves a training label: if no review was recorded since the
   * latest AI result, an implicit one is written (agree when the decision matches the AI verdict).
   */
  private async ensureLabel(
    tx: Tx,
    auth: AuthContext,
    photo: { id: string; category: PhotoCategory; analyses: Analysis[] },
    verdict: HumanVerdict,
    reason?: string,
  ): Promise<void> {
    const analysis = photo.analyses[0] ?? null;
    const since = analysis?.createdAt ?? new Date(0);
    const existing = await tx.review.findFirst({ where: { photoId: photo.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    if (existing && existing.verdict === verdict) return;
    const agrees = analysis?.verdict === verdict;
    await tx.review.create({
      data: {
        photoId: photo.id,
        reviewerId: auth.user.id,
        analysisId: analysis?.id ?? null,
        decision: agrees ? 'agree' : 'override',
        verdict,
        aiVerdict: analysis?.verdict ?? null,
        category: photo.category,
        reason: reason ?? (agrees ? null : `implicit: photo ${verdict === 'accept' ? 'approved' : 'rejected'} without a matching review`),
        payload: { implicit: true },
      },
    });
  }

  private async decide(tx: Tx, auth: AuthContext, photoId: string, from: PhotoStatus, data: Prisma.PhotoUpdateManyMutationInput) {
    const changed = await tx.photo.updateMany({
      where: { id: photoId, status: from },
      data: { ...data, decidedById: auth.user.id, decidedAt: new Date() },
    });
    if (changed.count === 0) throw conflict('CONCURRENT_UPDATE', 'Photo was changed by someone else; reload and retry');
    return this.presenter.present(await tx.photo.findUniqueOrThrow({ where: { id: photoId } }));
  }

}
