import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { Prisma, UNIQUE_VIOLATION, type Photo, type PrismaClient } from '@acceptance/db';
import { analyzePhotoJobId, JobName, type AnalyzePhotoJob, type JobQueue } from '@acceptance/queue';
import { UploadPhotoMetadata, type ListPhotosQuery } from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import { whereFor } from '../auth/ability.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { AppConfig } from '../config/config.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { CONFIG, LOGGER, PRISMA, QUEUE, STORAGE } from '../core/tokens.js';
import { photoKeys, processImage } from './image-processing.js';
import { PhotoPresenter, type PhotoDto } from './photo-presenter.js';
import { assertPhotoTransition } from './photo-state.js';

export interface UploadedFile {
  data: Buffer;
  filename?: string;
  mimetype?: string;
}

export interface UploadResult {
  photo: PhotoDto;
  created: boolean;
  /** Why no new photo was created: retry of the same capture, or identical bytes already in this visit. */
  duplicate?: 'client_uuid' | 'content';
}

const OPEN_VISIT = ['planned', 'in_progress'] as const;

@Injectable()
export class PhotosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(QUEUE) private readonly queue: JobQueue,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(PhotoPresenter) private readonly presenter: PhotoPresenter,
  ) {}

  /**
   * Idempotent upload (see docs/adr/0002-photo-upload.md):
   * same clientUuid -> the stored photo is returned (safe offline-queue retries);
   * same bytes in the same visit/category -> existing photo returned;
   * same bytes elsewhere -> new photo flagged with duplicateOfId (possible reuse of an old photo).
   */
  async upload(auth: AuthContext, file: UploadedFile, rawMetadata: unknown): Promise<UploadResult> {
    const parsed = UploadPhotoMetadata.safeParse(rawMetadata);
    if (!parsed.success) {
      throw badRequest('VALIDATION_FAILED', 'Invalid photo metadata', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    const meta = parsed.data;

    const retry = await this.prisma.photo.findUnique({ where: { clientUuid: meta.clientUuid } });
    if (retry) return this.asRetry(auth, retry, meta.visitId);

    const visit = await this.prisma.visit.findFirst({ where: { AND: [whereFor(auth.ability, 'upload', 'Visit'), { id: meta.visitId }] } });
    if (!visit) throw notFound('Visit', meta.visitId);
    // Snag fixes usually happen after the visit was submitted and reviewed, so a re-shot of a rejected
    // photo is still accepted on a submitted visit (validated below); closed/cancelled visits stay shut.
    const open = (OPEN_VISIT as readonly string[]).includes(visit.status) || (meta.fixesPhotoId !== undefined && visit.status === 'submitted');
    if (!open) throw conflict('VISIT_NOT_OPEN', `Visit is ${visit.status}; uploads are closed`);

    if (meta.fixesPhotoId) {
      const original = await this.prisma.photo.findUnique({ where: { id: meta.fixesPhotoId } });
      if (!original || original.siteId !== visit.siteId || original.category !== meta.category) {
        throw badRequest('INVALID_FIXES_PHOTO', 'fixesPhotoId must be a photo of the same site and category');
      }
      if (original.status !== 'rejected' && original.status !== 'fixed') {
        throw conflict('PHOTO_NOT_REJECTED', 'Only rejected photos can be fixed by a re-shot');
      }
    }

    const img = await processImage(file.data);
    const sameContent = await this.prisma.photo.findFirst({ where: { sha256: img.sha256 }, orderBy: { uploadedAt: 'asc' } });
    if (sameContent && sameContent.visitId === visit.id && sameContent.category === meta.category) {
      return { photo: await this.presenter.present(sameContent), created: false, duplicate: 'content' };
    }

    const keys = photoKeys(img.sha256, img.ext);
    await Promise.all([
      this.putIfMissing(keys.original, file.data, img.mimeType),
      this.putIfMissing(keys.web, img.web, 'image/jpeg'),
      this.putIfMissing(keys.thumb, img.thumb, 'image/jpeg'),
    ]);

    const gps = meta.gps ?? (img.exif?.gps ? { lat: img.exif.gps.lat, lng: img.exif.gps.lng, accuracy: undefined } : undefined);
    const capturedAt = meta.capturedAt ?? (img.exif?.takenAt ? new Date(img.exif.takenAt) : undefined);
    let photo: Photo;
    try {
      photo = await this.prisma.$transaction(async (tx) => {
        const submission = await tx.submission.upsert({
          where: { visitId_category: { visitId: visit.id, category: meta.category } },
          update: {},
          create: { visitId: visit.id, category: meta.category },
        });
        if (visit.status === 'planned') {
          await tx.visit.update({ where: { id: visit.id }, data: { status: 'in_progress', startedAt: visit.startedAt ?? new Date() } });
        }
        return tx.photo.create({
          data: {
            clientUuid: meta.clientUuid,
            submissionId: submission.id,
            visitId: visit.id,
            siteId: visit.siteId,
            category: meta.category,
            status: 'uploaded',
            sha256: img.sha256,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            width: img.width,
            height: img.height,
            originalKey: keys.original,
            webKey: keys.web,
            thumbKey: keys.thumb,
            exif: img.exif ? (img.exif as Prisma.InputJsonValue) : Prisma.JsonNull,
            capturedAt: capturedAt ?? null,
            gpsLat: gps?.lat ?? null,
            gpsLng: gps?.lng ?? null,
            gpsAccuracy: gps?.accuracy ?? null,
            deviceInfo: meta.deviceInfo ? (meta.deviceInfo as Prisma.InputJsonValue) : Prisma.JsonNull,
            duplicateOfId: sameContent?.id ?? null,
            fixesPhotoId: meta.fixesPhotoId ?? null,
            uploadedById: auth.user.id,
          },
        });
      });
    } catch (err) {
      // Two concurrent retries of the same capture: the loser returns the winner's photo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        const winner = await this.prisma.photo.findUnique({ where: { clientUuid: meta.clientUuid } });
        if (winner) return this.asRetry(auth, winner, meta.visitId);
      }
      throw err;
    }

    await this.enqueueAnalysis(photo.id, 'upload');
    return { photo: await this.presenter.present(photo), created: true };
  }

  async list(auth: AuthContext, q: ListPhotosQuery) {
    const where: Prisma.PhotoWhereInput = {
      AND: [
        whereFor(auth.ability, 'read', 'Photo'),
        { visitId: q.visitId, siteId: q.siteId, category: q.category, status: q.status, ...(q.projectId ? { site: { projectId: q.projectId } } : {}) },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.photo.findMany({ where, orderBy: [{ uploadedAt: 'desc' }, { id: 'asc' }], ...pageArgs(q) }),
      this.prisma.photo.count({ where }),
    ]);
    return toPage(await this.presenter.presentMany(rows), total, q);
  }

  async get(auth: AuthContext, id: string) {
    const photo = await this.prisma.photo.findFirst({
      where: { AND: [whereFor(auth.ability, 'read', 'Photo'), { id }] },
      include: {
        analyses: { orderBy: { createdAt: 'desc' } },
        snags: { orderBy: { createdAt: 'asc' } },
        reviews: { orderBy: { createdAt: 'desc' }, include: { reviewer: { select: { id: true, name: true } } } },
      },
    });
    if (!photo) throw notFound('Photo', id);
    const { analyses, snags, reviews, ...p } = photo;
    return { ...(await this.presenter.presentDetail(p)), analyses, snags, reviews };
  }

  /** Re-run AI on a photo awaiting review (e.g. after a prompt change or a failed/skipped analysis). */
  async reanalyze(id: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw notFound('Photo', id);
    if (photo.status !== 'uploaded') {
      assertPhotoTransition(photo.status, 'uploaded');
      const changed = await this.prisma.photo.updateMany({ where: { id, status: photo.status }, data: { status: 'uploaded', aiSkipReason: null } });
      if (changed.count === 0) throw conflict('CONCURRENT_UPDATE', 'Photo changed meanwhile; retry');
    }
    await this.enqueueAnalysis(id, 'reanalyze');
    return this.presenter.present(await this.prisma.photo.findUniqueOrThrow({ where: { id } }));
  }

  /** Enqueue analysis for photos stuck in `uploaded` (e.g. queue outage during upload). */
  async requeueStuck(olderThanMinutes = 10): Promise<{ enqueued: number }> {
    const stuck = await this.prisma.photo.findMany({
      where: { status: 'uploaded', uploadedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
      select: { id: true },
      take: 1000,
    });
    for (const p of stuck) await this.enqueueAnalysis(p.id, 'reanalyze');
    return { enqueued: stuck.length };
  }

  private async asRetry(auth: AuthContext, photo: Photo, visitId: string): Promise<UploadResult> {
    if (photo.uploadedById !== auth.user.id || photo.visitId !== visitId) {
      throw conflict('CLIENT_UUID_CONFLICT', 'clientUuid already used for a different upload');
    }
    return { photo: await this.presenter.present(photo), created: false, duplicate: 'client_uuid' };
  }

  private async putIfMissing(key: string, data: Uint8Array, contentType: string): Promise<void> {
    if (await this.storage.exists(key)) return;
    await this.storage.put(key, data, { contentType });
  }

  private async enqueueAnalysis(photoId: string, reason: AnalyzePhotoJob['reason']): Promise<void> {
    try {
      await this.queue.enqueue<AnalyzePhotoJob>(
        JobName.analyzePhoto,
        { photoId, reason },
        { jobId: analyzePhotoJobId(photoId, reason), attempts: this.config.AI_MAX_ATTEMPTS },
      );
    } catch (err) {
      // The photo is safely stored; POST /photos/requeue-stuck recovers it later.
      this.logger.error({ err, photoId }, 'failed to enqueue analyze-photo job');
    }
  }
}
