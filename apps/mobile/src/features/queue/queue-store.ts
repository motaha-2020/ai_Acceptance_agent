import type { PhotoCategory } from '@acceptance/shared';
import type { SqlDb, SqlValue } from './sql';

/**
 * Persistent offline upload queue (SQLite). One row per captured photo, keyed by the
 * device-generated `clientUuid` that makes server uploads idempotent.
 *
 * Lifecycle:  queued -> uploading -> (linking ->) done
 *                 ^         |  transient error: back to queued/linking with backoff
 *                 |         v  permanent error: failed (file kept; user can retry or discard)
 *             recover() puts rows left in `uploading` by a crash back to `queued`.
 *
 * Invariant: the local photo file is only deleted after the server acknowledged the upload
 * (`server_photo_id` set). `pendingFileDeletes()` finishes deletions interrupted by a crash.
 */
export type QueueStatus = 'queued' | 'uploading' | 'linking' | 'done' | 'failed';

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface NewQueueItem {
  clientUuid: string;
  userId: string;
  visitId: string;
  category: PhotoCategory;
  fileUri: string;
  fileSize: number | null;
  capturedAt: string;
  gps: GpsFix | null;
  deviceInfo: Record<string, string | number | boolean>;
  /** Re-shot of a rejected photo (snag fix flow). */
  fixesPhotoId?: string | null;
  /** Snags to mark fixed with the uploaded photo once the server acknowledged it. */
  fixSnagIds?: string[];
}

export interface QueueItem extends Required<Omit<NewQueueItem, 'fixesPhotoId'>> {
  seq: number;
  fixesPhotoId: string | null;
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  serverPhotoId: string | null;
  fileDeleted: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  seq: number;
  client_uuid: string;
  user_id: string;
  visit_id: string;
  category: string;
  file_uri: string;
  file_size: number | null;
  captured_at: string;
  gps_json: string | null;
  device_json: string;
  fixes_photo_id: string | null;
  fix_snag_ids: string;
  status: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  server_photo_id: string | null;
  file_deleted: number;
  created_at: number;
  updated_at: number;
}

const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS upload_queue (
      seq             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_uuid     TEXT    NOT NULL UNIQUE,
      user_id         TEXT    NOT NULL,
      visit_id        TEXT    NOT NULL,
      category        TEXT    NOT NULL,
      file_uri        TEXT    NOT NULL,
      file_size       INTEGER,
      captured_at     TEXT    NOT NULL,
      gps_json        TEXT,
      device_json     TEXT    NOT NULL,
      fixes_photo_id  TEXT,
      fix_snag_ids    TEXT    NOT NULL DEFAULT '[]',
      status          TEXT    NOT NULL DEFAULT 'queued',
      attempts        INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT,
      server_photo_id TEXT,
      file_deleted    INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS upload_queue_ready ON upload_queue (status, next_attempt_at, seq);
    CREATE INDEX IF NOT EXISTS upload_queue_visit ON upload_queue (visit_id, category);
  `,
};

function toItem(r: Row): QueueItem {
  return {
    seq: r.seq,
    clientUuid: r.client_uuid,
    userId: r.user_id,
    visitId: r.visit_id,
    category: r.category as PhotoCategory,
    fileUri: r.file_uri,
    fileSize: r.file_size,
    capturedAt: r.captured_at,
    gps: r.gps_json ? (JSON.parse(r.gps_json) as GpsFix) : null,
    deviceInfo: JSON.parse(r.device_json) as Record<string, string | number | boolean>,
    fixesPhotoId: r.fixes_photo_id,
    fixSnagIds: JSON.parse(r.fix_snag_ids) as string[],
    status: r.status as QueueStatus,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    serverPhotoId: r.server_photo_id,
    fileDeleted: r.file_deleted === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface QueueCounts {
  queued: number;
  uploading: number;
  linking: number;
  failed: number;
  done: number;
}

export class QueueStore {
  constructor(
    private readonly db: SqlDb,
    private readonly now: () => number = Date.now,
  ) {}

  /** Create/upgrade the schema (idempotent). */
  async migrate(): Promise<void> {
    const row = await this.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    let version = row?.user_version ?? 0;
    while (version < SCHEMA_VERSION) {
      version += 1;
      const sql = MIGRATIONS[version];
      if (!sql) throw new Error(`missing queue migration ${version}`);
      await this.db.execAsync(sql);
      await this.db.execAsync(`PRAGMA user_version = ${version}`);
    }
  }

  async enqueue(item: NewQueueItem): Promise<QueueItem> {
    const t = this.now();
    await this.db.runAsync(
      `INSERT INTO upload_queue (client_uuid, user_id, visit_id, category, file_uri, file_size, captured_at, gps_json, device_json,
                                 fixes_photo_id, fix_snag_ids, status, attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, 0, ?, ?)`,
      [
        item.clientUuid,
        item.userId,
        item.visitId,
        item.category,
        item.fileUri,
        item.fileSize,
        item.capturedAt,
        item.gps ? JSON.stringify(item.gps) : null,
        JSON.stringify(item.deviceInfo),
        item.fixesPhotoId ?? null,
        JSON.stringify(item.fixSnagIds ?? []),
        t,
        t,
      ],
    );
    const created = await this.get(item.clientUuid);
    if (!created) throw new Error('queue insert failed');
    return created;
  }

  async get(clientUuid: string): Promise<QueueItem | null> {
    const r = await this.db.getFirstAsync<Row>('SELECT * FROM upload_queue WHERE client_uuid = ?', [clientUuid]);
    return r ? toItem(r) : null;
  }

  /** Rows interrupted mid-upload by a crash or kill are safe to resend (idempotent clientUuid). */
  async recover(): Promise<number> {
    const res = await this.db.runAsync(`UPDATE upload_queue SET status = 'queued', updated_at = ? WHERE status = 'uploading'`, [this.now()]);
    return res.changes;
  }

  /** Oldest item of this user that may be worked on now (capture order). */
  async nextReady(userId: string, now = this.now()): Promise<QueueItem | null> {
    const r = await this.db.getFirstAsync<Row>(
      `SELECT * FROM upload_queue
        WHERE user_id = ? AND status IN ('queued', 'linking') AND next_attempt_at <= ?
        ORDER BY seq ASC LIMIT 1`,
      [userId, now],
    );
    return r ? toItem(r) : null;
  }

  /** Earliest time a waiting (backed-off) item of this user becomes ready, or null. */
  async nextWakeAt(userId: string): Promise<number | null> {
    const r = await this.db.getFirstAsync<{ t: number | null }>(
      `SELECT MIN(next_attempt_at) AS t FROM upload_queue WHERE user_id = ? AND status IN ('queued', 'linking')`,
      [userId],
    );
    return r?.t ?? null;
  }

  async markUploading(clientUuid: string): Promise<void> {
    await this.transition(clientUuid, ['queued'], { status: 'uploading' });
  }

  /**
   * Server confirmed the photo. Records the server id first; only after this is persisted may the
   * caller delete the local file (then call `markFileDeleted`).
   */
  async markAcked(clientUuid: string, serverPhotoId: string): Promise<QueueItem> {
    const item = await this.require(clientUuid);
    const next: QueueStatus = item.fixSnagIds.length > 0 ? 'linking' : 'done';
    await this.transition(clientUuid, ['uploading', 'queued'], {
      status: next,
      server_photo_id: serverPhotoId,
      attempts: 0,
      next_attempt_at: 0,
      last_error: null,
    });
    return this.require(clientUuid);
  }

  async markFileDeleted(clientUuid: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE upload_queue SET file_deleted = 1, updated_at = ? WHERE client_uuid = ? AND server_photo_id IS NOT NULL`,
      [this.now(), clientUuid],
    );
  }

  /** A snag was linked (or could not be and was skipped); remove it from the pending list. */
  async markSnagLinked(clientUuid: string, snagId: string, error?: string): Promise<QueueItem> {
    const item = await this.require(clientUuid);
    const remaining = item.fixSnagIds.filter((s) => s !== snagId);
    await this.transition(clientUuid, ['linking'], {
      fix_snag_ids: JSON.stringify(remaining),
      status: remaining.length === 0 ? 'done' : 'linking',
      last_error: error ?? item.lastError,
    });
    return this.require(clientUuid);
  }

  /** Transient failure: back to the phase it was in, with a later retry time. */
  async markRetry(clientUuid: string, error: string, nextAttemptAt: number): Promise<void> {
    const item = await this.require(clientUuid);
    const phase: QueueStatus = item.serverPhotoId ? 'linking' : 'queued';
    await this.transition(clientUuid, ['uploading', 'queued', 'linking'], {
      status: phase,
      attempts: item.attempts + 1,
      next_attempt_at: nextAttemptAt,
      last_error: error.slice(0, 500),
    });
  }

  /** Authentication expired: put the item back without counting an attempt. */
  async release(clientUuid: string): Promise<void> {
    const item = await this.require(clientUuid);
    await this.transition(clientUuid, ['uploading', 'queued', 'linking'], { status: item.serverPhotoId ? 'linking' : 'queued' });
  }

  /** Permanent failure (validation, visit closed...). The photo file is kept. */
  async markFailed(clientUuid: string, error: string): Promise<void> {
    await this.transition(clientUuid, ['uploading', 'queued', 'linking'], { status: 'failed', last_error: error.slice(0, 500) });
  }

  /** User asked to try a failed item again. */
  async retryFailed(clientUuid: string): Promise<void> {
    await this.transition(clientUuid, ['failed'], { status: 'queued', attempts: 0, next_attempt_at: 0, last_error: null });
  }

  /** Make every waiting item ready now (manual "sync now"). */
  async wakeAll(userId: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE upload_queue SET next_attempt_at = 0, updated_at = ? WHERE user_id = ? AND status IN ('queued', 'linking')`,
      [this.now(), userId],
    );
  }

  /**
   * Remove a failed item the user explicitly discarded. Returns the file to delete; never used
   * for items the server has not acknowledged unless the user confirmed.
   */
  async discardFailed(clientUuid: string): Promise<string | null> {
    const item = await this.get(clientUuid);
    if (!item || item.status !== 'failed') return null;
    await this.db.runAsync(`DELETE FROM upload_queue WHERE client_uuid = ? AND status = 'failed'`, [clientUuid]);
    return item.fileDeleted ? null : item.fileUri;
  }

  /** Acknowledged items whose local file still exists (deletion interrupted). */
  async pendingFileDeletes(): Promise<QueueItem[]> {
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM upload_queue WHERE server_photo_id IS NOT NULL AND file_deleted = 0 ORDER BY seq`,
      [],
    );
    return rows.map(toItem);
  }

  async list(filter: { userId?: string; visitId?: string; statuses?: QueueStatus[] } = {}): Promise<QueueItem[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (filter.userId) {
      where.push('user_id = ?');
      params.push(filter.userId);
    }
    if (filter.visitId) {
      where.push('visit_id = ?');
      params.push(filter.visitId);
    }
    if (filter.statuses?.length) {
      where.push(`status IN (${filter.statuses.map(() => '?').join(', ')})`);
      params.push(...filter.statuses);
    }
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM upload_queue ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq ASC`,
      params,
    );
    return rows.map(toItem);
  }

  async counts(userId?: string): Promise<QueueCounts> {
    const rows = await this.db.getAllAsync<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM upload_queue ${userId ? 'WHERE user_id = ?' : ''} GROUP BY status`,
      userId ? [userId] : [],
    );
    const c: QueueCounts = { queued: 0, uploading: 0, linking: 0, failed: 0, done: 0 };
    for (const r of rows) if (r.status in c) c[r.status as keyof QueueCounts] = Number(r.n);
    return c;
  }

  /** Forget finished rows older than `maxAgeMs` (their files are already deleted). */
  async pruneDone(maxAgeMs: number): Promise<number> {
    const res = await this.db.runAsync(
      `DELETE FROM upload_queue WHERE status = 'done' AND file_deleted = 1 AND updated_at < ?`,
      [this.now() - maxAgeMs],
    );
    return res.changes;
  }

  private async require(clientUuid: string): Promise<QueueItem> {
    const item = await this.get(clientUuid);
    if (!item) throw new Error(`queue item ${clientUuid} not found`);
    return item;
  }

  /** Guarded update: only applies when the row is in one of the expected states. */
  private async transition(clientUuid: string, from: QueueStatus[], set: Record<string, SqlValue>): Promise<void> {
    const cols = Object.keys(set);
    const res = await this.db.runAsync(
      `UPDATE upload_queue SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ?
        WHERE client_uuid = ? AND status IN (${from.map(() => '?').join(', ')})`,
      [...cols.map((c) => set[c] ?? null), this.now(), clientUuid, ...from],
    );
    if (res.changes === 0) {
      const current = await this.get(clientUuid);
      throw new Error(`queue item ${clientUuid}: cannot change from ${current?.status ?? 'missing'} (expected ${from.join('|')})`);
    }
  }
}
