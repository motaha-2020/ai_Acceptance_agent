import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueueStore, type NewQueueItem, type QueueItem } from '../src/features/queue/queue-store';
import type { RemoteOutcome } from '../src/features/queue/retry-policy';
import { backoffDelay, classify } from '../src/features/queue/retry-policy';
import { SyncEngine, type SyncPorts } from '../src/features/queue/sync-engine';
import { openNodeSqlite } from './sqlite-node';

const USER = 'user-1';
let n = 0;
const item = (over: Partial<NewQueueItem> = {}): NewQueueItem => {
  n += 1;
  return {
    clientUuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    userId: USER,
    visitId: 'visit-1',
    category: 'rack',
    fileUri: `file:///data/photos/${n}.jpg`,
    fileSize: 1000 + n,
    capturedAt: new Date(1_700_000_000_000 + n).toISOString(),
    gps: { lat: 30.05, lng: 31.33, accuracy: 6 },
    deviceInfo: { model: 'Pixel', appVersion: '1.0.0' },
    ...over,
  };
};

/** Fake "server + disk" that records every call. */
class World {
  files = new Set<string>();
  uploads: string[] = [];
  serverPhotos = new Map<string, string>(); // clientUuid -> photoId (server dedupe)
  fixes: Array<[string, string]> = [];
  online = true;
  clock = 1_000_000;
  next: Array<RemoteOutcome<{ photoId: string }> | 'throw'> = [];
  fixNext: Array<RemoteOutcome<undefined>> = [];
  deletesBeforeAck: string[] = [];
  ackedFiles = new Set<string>();

  ports(store: QueueStore, user: string | null = USER): SyncPorts {
    return {
      store,
      uploadPhoto: async (it: QueueItem) => {
        this.uploads.push(it.clientUuid);
        const scripted = this.next.shift();
        if (scripted === 'throw') throw new Error('socket hang up');
        if (scripted && scripted.kind !== 'ok') return scripted;
        const id = this.serverPhotos.get(it.clientUuid) ?? `photo-${this.serverPhotos.size + 1}`;
        this.serverPhotos.set(it.clientUuid, id);
        this.ackedFiles.add(it.fileUri);
        return { kind: 'ok', value: { photoId: id } };
      },
      fixSnag: async (snagId: string, photoId: string) => {
        const scripted = this.fixNext.shift();
        if (scripted) return scripted;
        this.fixes.push([snagId, photoId]);
        return { kind: 'ok', value: undefined };
      },
      files: {
        exists: (uri) => this.files.has(uri),
        delete: (uri) => {
          if (!this.ackedFiles.has(uri)) this.deletesBeforeAck.push(uri);
          this.files.delete(uri);
        },
      },
      isOnline: async () => this.online,
      currentUserId: () => user,
      now: () => this.clock,
      random: () => 0.5,
    };
  }
}

let dir: string;
let dbFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'queue-'));
  dbFile = path.join(dir, 'queue.db');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function openStore(world: World) {
  const db = openNodeSqlite(dbFile);
  const store = new QueueStore(db, () => world.clock);
  await store.migrate();
  return { db, store };
}

describe('retry policy', () => {
  it('classifies outcomes', () => {
    expect(classify({ kind: 'ok', value: 1 })).toBe('success');
    expect(classify({ kind: 'network', message: 'x' })).toBe('retry');
    expect(classify({ kind: 'http', status: 503, message: '' })).toBe('retry');
    expect(classify({ kind: 'http', status: 429, message: '' })).toBe('retry');
    expect(classify({ kind: 'http', status: 401, message: '' })).toBe('auth');
    expect(classify({ kind: 'http', status: 409, code: 'VISIT_NOT_OPEN', message: '' })).toBe('permanent');
    expect(classify({ kind: 'http', status: 400, message: '' })).toBe('permanent');
  });

  it('backs off exponentially with jitter and a cap', () => {
    const fixed = () => 1; // max jitter
    expect(backoffDelay(0, fixed)).toBe(5_000);
    expect(backoffDelay(1, fixed)).toBe(10_000);
    expect(backoffDelay(3, fixed)).toBe(40_000);
    expect(backoffDelay(50, fixed)).toBe(30 * 60_000);
    expect(backoffDelay(2, () => 0)).toBe(10_000); // half of 20 s
  });
});

describe('queue persistence', () => {
  it('survives an app restart (reopen the same database)', async () => {
    const w = new World();
    const a = await openStore(w);
    const first = await a.store.enqueue(item());
    await a.store.enqueue(item());
    a.db.close();

    const b = await openStore(w);
    await b.store.migrate(); // idempotent
    const rows = await b.store.list();
    expect(rows.map((r) => r.clientUuid)).toEqual([first.clientUuid, rows[1]!.clientUuid]);
    expect(rows[0]).toMatchObject({ status: 'queued', gps: { lat: 30.05, lng: 31.33, accuracy: 6 }, deviceInfo: { model: 'Pixel' } });
    b.db.close();
  });

  it('rejects a duplicate clientUuid', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = item();
    await store.enqueue(it1);
    await expect(store.enqueue(it1)).rejects.toThrow();
    db.close();
  });

  it('puts uploads interrupted by a crash back in the queue', async () => {
    const w = new World();
    const a = await openStore(w);
    const it1 = await a.store.enqueue(item());
    await a.store.markUploading(it1.clientUuid);
    a.db.close(); // "crash" while uploading

    const b = await openStore(w);
    const engine = new SyncEngine(w.ports(b.store));
    await engine.recover();
    expect((await b.store.get(it1.clientUuid))!.status).toBe('queued');
    b.db.close();
  });
});

describe('sync engine', () => {
  it('uploads in capture order and deletes each file only after the server acknowledged it', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const items = [await store.enqueue(item()), await store.enqueue(item()), await store.enqueue(item())];
    for (const i of items) w.files.add(i.fileUri);

    const summary = await new SyncEngine(w.ports(store)).run();
    expect(summary).toMatchObject({ uploaded: 3, stoppedBecause: 'drained' });
    expect(w.uploads).toEqual(items.map((i) => i.clientUuid));
    expect(w.files.size).toBe(0);
    expect(w.deletesBeforeAck).toEqual([]);
    const rows = await store.list();
    expect(rows.every((r) => r.status === 'done' && r.fileDeleted && r.serverPhotoId)).toBe(true);
    db.close();
  });

  it('never deletes the file when the upload fails, and retries with backoff', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item());
    w.files.add(it1.fileUri);
    w.next.push({ kind: 'http', status: 503, message: 'busy' });

    const s1 = await new SyncEngine(w.ports(store)).run();
    expect(s1).toMatchObject({ retried: 1, stoppedBecause: 'waiting' });
    expect(w.files.has(it1.fileUri)).toBe(true);
    const row = (await store.get(it1.clientUuid))!;
    expect(row).toMatchObject({ status: 'queued', attempts: 1, lastError: 'HTTP 503: busy' });
    expect(row.nextAttemptAt).toBe(w.clock + backoffDelay(0, () => 0.5));
    expect(s1.nextWakeAt).toBe(row.nextAttemptAt);

    // Not ready yet: nothing is sent.
    expect((await new SyncEngine(w.ports(store)).run()).stoppedBecause).toBe('waiting');
    expect(w.uploads).toHaveLength(1);

    w.clock = row.nextAttemptAt;
    const s2 = await new SyncEngine(w.ports(store)).run();
    expect(s2.uploaded).toBe(1);
    expect(w.files.has(it1.fileUri)).toBe(false);
    db.close();
  });

  it('treats thrown transport errors as retryable', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item());
    w.files.add(it1.fileUri);
    w.next.push('throw');
    const s = await new SyncEngine(w.ports(store)).run();
    expect(s.retried).toBe(1);
    expect((await store.get(it1.clientUuid))!.lastError).toContain('socket hang up');
    db.close();
  });

  it('a backed-off item does not block later items (head-of-line)', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const a = await store.enqueue(item());
    const b = await store.enqueue(item());
    w.files.add(a.fileUri).add(b.fileUri);
    w.next.push({ kind: 'http', status: 500, message: 'boom' });
    const s = await new SyncEngine(w.ports(store)).run();
    expect(s.uploaded).toBe(1);
    expect((await store.get(b.clientUuid))!.status).toBe('done');
    expect((await store.get(a.clientUuid))!.status).toBe('queued');
    db.close();
  });

  it('permanent errors keep the photo for the user (failed), others continue', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const a = await store.enqueue(item());
    const b = await store.enqueue(item());
    w.files.add(a.fileUri).add(b.fileUri);
    w.next.push({ kind: 'http', status: 409, code: 'VISIT_NOT_OPEN', message: 'Visit is closed' });
    const s = await new SyncEngine(w.ports(store)).run();
    expect(s).toMatchObject({ failed: 1, uploaded: 1 });
    expect(w.files.has(a.fileUri)).toBe(true);
    expect((await store.get(a.clientUuid))!).toMatchObject({ status: 'failed', lastError: 'HTTP 409 VISIT_NOT_OPEN: Visit is closed' });

    // User retries; this time it goes through.
    await store.retryFailed(a.clientUuid);
    expect((await new SyncEngine(w.ports(store)).run()).uploaded).toBe(1);
    expect(w.files.has(a.fileUri)).toBe(false);
    db.close();
  });

  it('is idempotent: re-sending after a lost response maps to the same server photo', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item());
    w.files.add(it1.fileUri);
    // The server stored it but the response never arrived (we simulate by pre-registering it).
    w.serverPhotos.set(it1.clientUuid, 'photo-77');
    w.next.push({ kind: 'network', message: 'timeout' });
    await new SyncEngine(w.ports(store)).run();
    w.clock += 60 * 60_000;
    await new SyncEngine(w.ports(store)).run();
    expect(w.uploads).toEqual([it1.clientUuid, it1.clientUuid]);
    expect((await store.get(it1.clientUuid))!.serverPhotoId).toBe('photo-77');
    db.close();
  });

  it('stops when offline without touching items', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item());
    w.files.add(it1.fileUri);
    w.online = false;
    const s = await new SyncEngine(w.ports(store)).run();
    expect(s.stoppedBecause).toBe('offline');
    expect(w.uploads).toEqual([]);
    expect((await store.get(it1.clientUuid))!.attempts).toBe(0);
    db.close();
  });

  it('stops on expired login without counting an attempt; only uploads the current user items', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const mine = await store.enqueue(item());
    const other = await store.enqueue(item({ userId: 'someone-else' }));
    w.files.add(mine.fileUri).add(other.fileUri);
    w.next.push({ kind: 'auth', message: 'refresh failed' });
    const s = await new SyncEngine(w.ports(store)).run();
    expect(s.stoppedBecause).toBe('auth');
    expect((await store.get(mine.clientUuid))!).toMatchObject({ status: 'queued', attempts: 0 });
    await new SyncEngine(w.ports(store)).run();
    expect(w.uploads).toEqual([mine.clientUuid, mine.clientUuid]);
    expect((await store.get(other.clientUuid))!.status).toBe('queued');
    expect((await new SyncEngine(w.ports(store, null)).run()).stoppedBecause).toBe('no_user');
    db.close();
  });

  it('marks a missing local file as failed instead of looping', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item());
    const s = await new SyncEngine(w.ports(store)).run();
    expect(s.failed).toBe(1);
    expect((await store.get(it1.clientUuid))!.lastError).toContain('FILE_MISSING');
    db.close();
  });

  it('snag fix flow: links every snag to the uploaded re-shot, resuming after a retry', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item({ fixesPhotoId: 'rejected-1', fixSnagIds: ['s1', 's2', 's3'] }));
    w.files.add(it1.fileUri);
    w.fixNext.push({ kind: 'ok', value: undefined }, { kind: 'network', message: 'offline' });

    const s1 = await new SyncEngine(w.ports(store)).run();
    expect(s1).toMatchObject({ uploaded: 1, linked: 1, retried: 1 });
    // Photo is on the server: file gone, item waits in `linking` with the remaining snags.
    expect(w.files.has(it1.fileUri)).toBe(false);
    expect((await store.get(it1.clientUuid))!).toMatchObject({ status: 'linking', fixSnagIds: ['s2', 's3'] });

    w.clock += 60 * 60_000;
    const s2 = await new SyncEngine(w.ports(store)).run();
    expect(s2.linked).toBe(2);
    expect(w.uploads).toHaveLength(1); // not re-uploaded
    expect(w.fixes).toEqual([
      ['s2', 'photo-1'],
      ['s3', 'photo-1'],
    ]);
    expect((await store.get(it1.clientUuid))!.status).toBe('done');
    db.close();
  });

  it('snag already fixed by someone else (409) does not block the item', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item({ fixSnagIds: ['s1'] }));
    w.files.add(it1.fileUri);
    w.fixNext.push({ kind: 'http', status: 409, code: 'INVALID_STATE_TRANSITION', message: 'already fixed' });
    const s = await new SyncEngine(w.ports(store)).run();
    expect(s.linked).toBe(1);
    expect((await store.get(it1.clientUuid))!.status).toBe('done');
    db.close();
  });

  it('finishes file deletions interrupted after the server ack', async () => {
    const w = new World();
    const a = await openStore(w);
    const it1 = await a.store.enqueue(item());
    w.files.add(it1.fileUri);
    await a.store.markUploading(it1.clientUuid);
    await a.store.markAcked(it1.clientUuid, 'photo-9'); // crash before the delete
    a.db.close();

    const b = await openStore(w);
    await new SyncEngine(w.ports(b.store)).recover();
    expect(w.files.has(it1.fileUri)).toBe(false);
    expect((await b.store.get(it1.clientUuid))!.fileDeleted).toBe(true);
    b.db.close();
  });

  it('concurrent run() calls share one drain (no double upload)', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item());
    w.files.add(it1.fileUri);
    const engine = new SyncEngine(w.ports(store));
    const [r1, r2] = await Promise.all([engine.run(), engine.run()]);
    expect(r1).toBe(r2);
    expect(w.uploads).toHaveLength(1);
    db.close();
  });

  it('discarding is only possible for failed items and prunes old done rows', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    const it1 = await store.enqueue(item());
    expect(await store.discardFailed(it1.clientUuid)).toBeNull();
    await store.markFailed(it1.clientUuid, 'x');
    expect(await store.discardFailed(it1.clientUuid)).toBe(it1.fileUri);
    expect(await store.get(it1.clientUuid)).toBeNull();

    const it2 = await store.enqueue(item());
    w.files.add(it2.fileUri);
    await new SyncEngine(w.ports(store)).run();
    w.clock += 8 * 24 * 3600_000;
    expect(await store.pruneDone(7 * 24 * 3600_000)).toBe(1);
    expect(await store.counts()).toEqual({ queued: 0, uploading: 0, linking: 0, failed: 0, done: 0 });
    db.close();
  });

  it('reports photos still on the phone per account (done rows excluded)', async () => {
    const w = new World();
    const { store, db } = await openStore(w);
    await store.enqueue(item({ userId: 'user-a' }));
    const failed = await store.enqueue(item({ userId: 'user-a' }));
    await store.markFailed(failed.clientUuid, 'HTTP 400');
    const doneItem = await store.enqueue(item({ userId: 'user-b' }));
    await store.markUploading(doneItem.clientUuid);
    await store.markAcked(doneItem.clientUuid, 'photo-1');
    await store.enqueue(item({ userId: 'user-c' }));
    expect(await store.pendingByUser()).toEqual([
      { userId: 'user-a', count: 2 },
      { userId: 'user-c', count: 1 },
    ]);
    db.close();
  });
});
