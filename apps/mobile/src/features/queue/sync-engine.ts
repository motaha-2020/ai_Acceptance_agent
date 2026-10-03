import type { QueueItem, QueueStore } from './queue-store';
import { backoffDelay, classify, describe, type BackoffOptions, type RemoteOutcome } from './retry-policy';

/** What the engine needs from the outside world (all injectable for tests). */
export interface SyncPorts {
  store: QueueStore;
  /** Upload the photo file + metadata (multipart, idempotent per clientUuid). */
  uploadPhoto(item: QueueItem): Promise<RemoteOutcome<{ photoId: string }>>;
  /** POST /snags/:id/fix with the uploaded photo. */
  fixSnag(snagId: string, fixPhotoId: string): Promise<RemoteOutcome<undefined>>;
  files: {
    exists(uri: string): boolean;
    delete(uri: string): void;
  };
  isOnline(): Promise<boolean>;
  currentUserId(): string | null;
  now?: () => number;
  random?: () => number;
  backoff?: BackoffOptions;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export type StopReason = 'drained' | 'offline' | 'auth' | 'no_user' | 'waiting' | 'aborted';

export interface SyncSummary {
  uploaded: number;
  linked: number;
  retried: number;
  failed: number;
  stoppedBecause: StopReason;
  /** When the next backed-off item becomes ready (ms epoch), if any. */
  nextWakeAt: number | null;
}

/**
 * Drains the offline queue one item at a time in capture order.
 * Guarantees: an item is never lost (failures keep the file), never deleted before the server
 * acknowledged it, and re-sent safely after a crash (the server dedupes by clientUuid).
 */
export class SyncEngine {
  private running: Promise<SyncSummary> | null = null;

  constructor(private readonly p: SyncPorts) {}

  get isRunning(): boolean {
    return this.running !== null;
  }

  /** Run once; concurrent callers share the same run. */
  run(signal?: { aborted: boolean }): Promise<SyncSummary> {
    if (!this.running) {
      this.running = this.drain(signal).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  /** Startup housekeeping: resend interrupted uploads, finish interrupted deletions. */
  async recover(): Promise<void> {
    await this.p.store.recover();
    for (const item of await this.p.store.pendingFileDeletes()) await this.deleteLocalFile(item);
  }

  private now(): number {
    return (this.p.now ?? Date.now)();
  }

  private async drain(signal?: { aborted: boolean }): Promise<SyncSummary> {
    const s: SyncSummary = { uploaded: 0, linked: 0, retried: 0, failed: 0, stoppedBecause: 'drained', nextWakeAt: null };
    const userId = this.p.currentUserId();
    if (!userId) return { ...s, stoppedBecause: 'no_user' };

    for (;;) {
      if (signal?.aborted) return { ...s, stoppedBecause: 'aborted' };
      if (!(await this.p.isOnline())) return { ...s, stoppedBecause: 'offline', nextWakeAt: await this.p.store.nextWakeAt(userId) };
      const item = await this.p.store.nextReady(userId, this.now());
      if (!item) {
        const wake = await this.p.store.nextWakeAt(userId);
        return { ...s, stoppedBecause: wake !== null ? 'waiting' : 'drained', nextWakeAt: wake };
      }
      const result = item.status === 'linking' ? await this.link(item, s) : await this.upload(item, s);
      if (result === 'auth') return { ...s, stoppedBecause: 'auth', nextWakeAt: await this.p.store.nextWakeAt(userId) };
    }
  }

  private async upload(item: QueueItem, s: SyncSummary): Promise<'continue' | 'auth'> {
    if (!this.p.files.exists(item.fileUri)) {
      // Should never happen (files live in app storage); surface it instead of retrying forever.
      await this.p.store.markFailed(item.clientUuid, 'FILE_MISSING: local photo file not found');
      s.failed += 1;
      return 'continue';
    }
    await this.p.store.markUploading(item.clientUuid);
    let outcome: RemoteOutcome<{ photoId: string }>;
    try {
      outcome = await this.p.uploadPhoto(item);
    } catch (err) {
      outcome = { kind: 'network', message: err instanceof Error ? err.message : String(err) };
    }
    switch (classify(outcome)) {
      case 'success': {
        if (outcome.kind !== 'ok') throw new Error('unreachable');
        const acked = await this.p.store.markAcked(item.clientUuid, outcome.value.photoId);
        // Server has the photo: only now may the local copy go.
        await this.deleteLocalFile(acked);
        s.uploaded += 1;
        if (acked.status === 'linking') return this.link(acked, s);
        return 'continue';
      }
      case 'auth':
        await this.p.store.release(item.clientUuid);
        return 'auth';
      case 'retry':
        await this.p.store.markRetry(item.clientUuid, describe(outcome), this.now() + backoffDelay(item.attempts, this.p.random, this.p.backoff));
        s.retried += 1;
        return 'continue';
      case 'permanent':
        await this.p.store.markFailed(item.clientUuid, describe(outcome));
        s.failed += 1;
        return 'continue';
    }
  }

  /** Mark each snag fixed with the uploaded re-shot (snag fix flow). */
  private async link(item: QueueItem, s: SyncSummary): Promise<'continue' | 'auth'> {
    let current = item;
    for (const snagId of item.fixSnagIds) {
      if (!current.serverPhotoId) throw new Error('linking without server photo id');
      let outcome: RemoteOutcome<undefined>;
      try {
        outcome = await this.p.fixSnag(snagId, current.serverPhotoId);
      } catch (err) {
        outcome = { kind: 'network', message: err instanceof Error ? err.message : String(err) };
      }
      const decision = classify(outcome);
      if (decision === 'success') {
        current = await this.p.store.markSnagLinked(item.clientUuid, snagId);
        s.linked += 1;
      } else if (decision === 'permanent') {
        // e.g. already fixed/verified by someone else: the photo is uploaded, keep going.
        const alreadyDone = outcome.kind === 'http' && outcome.status === 409;
        current = await this.p.store.markSnagLinked(item.clientUuid, snagId, alreadyDone ? undefined : describe(outcome));
        if (alreadyDone) s.linked += 1;
      } else if (decision === 'auth') {
        await this.p.store.release(item.clientUuid);
        return 'auth';
      } else {
        await this.p.store.markRetry(item.clientUuid, describe(outcome), this.now() + backoffDelay(current.attempts, this.p.random, this.p.backoff));
        s.retried += 1;
        return 'continue';
      }
    }
    return 'continue';
  }

  private async deleteLocalFile(item: QueueItem): Promise<void> {
    if (!item.serverPhotoId) throw new Error('refusing to delete a photo the server has not acknowledged');
    try {
      if (this.p.files.exists(item.fileUri)) this.p.files.delete(item.fileUri);
      await this.p.store.markFileDeleted(item.clientUuid);
    } catch (err) {
      // Left for the next recover(); the row still says file_deleted = 0.
      this.p.log?.('local file delete failed', { clientUuid: item.clientUuid, err: String(err) });
    }
  }
}
