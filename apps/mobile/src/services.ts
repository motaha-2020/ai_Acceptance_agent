import { AppState } from 'react-native';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { appConfig } from './config';
import { AuthSession, type SecretStorage } from './features/auth/session';
import { fileOps } from './features/capture/photo-files';
import { QueueStore, type QueueCounts } from './features/queue/queue-store';
import type { RemoteOutcome } from './features/queue/retry-policy';
import { SyncEngine } from './features/queue/sync-engine';
import { SyncScheduler, type SyncState } from './features/queue/sync-machine';
import { createPhotoUploader } from './features/queue/uploader';
import { ApiClient } from './lib/api/client';

const secureStorage: SecretStorage = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  remove: (k) => SecureStore.deleteItemAsync(k),
};

export interface QueueSnapshot {
  sync: SyncState;
  counts: QueueCounts;
}

/** Composition root of the app's non-UI services (also used by the background task). */
export class Services {
  readonly session: AuthSession;
  readonly api: ApiClient;
  readonly store: QueueStore;
  readonly engine: SyncEngine;
  readonly scheduler: SyncScheduler;
  private listeners = new Set<(s: QueueSnapshot) => void>();
  private snapshot: QueueSnapshot;

  private constructor(db: SQLite.SQLiteDatabase) {
    this.session = new AuthSession(appConfig.apiBaseUrl, secureStorage, (url, init) => fetch(url, init));
    this.api = new ApiClient(appConfig.apiBaseUrl, this.session, (url, init) => fetch(url, init));
    this.store = new QueueStore(db);
    const upload = createPhotoUploader(this.api, this.session);
    this.engine = new SyncEngine({
      store: this.store,
      uploadPhoto: (item) => upload(item),
      fixSnag: async (snagId, fixPhotoId) => {
        const r = await this.api.request(`/snags/${encodeURIComponent(snagId)}/fix`, { method: 'POST', body: { fixPhotoId } });
        return (r.kind === 'ok' ? { kind: 'ok', value: undefined } : r) as RemoteOutcome<undefined>;
      },
      files: fileOps,
      isOnline,
      currentUserId: () => this.session.user?.id ?? null,
      log: (msg, extra) => console.warn(`[sync] ${msg}`, extra ?? ''),
    });
    this.snapshot = { sync: { phase: 'idle', lastSyncAt: null }, counts: { queued: 0, uploading: 0, linking: 0, failed: 0, done: 0 } };
    this.scheduler = new SyncScheduler(
      async () => {
        const summary = await this.engine.run();
        await this.refreshCounts();
        return summary;
      },
      { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: Date.now },
      (sync) => this.publish({ ...this.snapshot, sync }),
    );
  }

  static async create(): Promise<Services> {
    const db = await SQLite.openDatabaseAsync('acceptance.db');
    await db.execAsync('PRAGMA journal_mode = WAL;');
    const s = new Services(db);
    await s.store.migrate();
    await s.engine.recover();
    await s.store.pruneDone(7 * 24 * 3600_000);
    await s.session.restore();
    await s.refreshCounts();
    s.session.subscribe((user) => {
      s.scheduler.dispatch({ type: user ? 'logged_in' : 'logged_out' });
      if (user) s.scheduler.trigger();
    });
    return s;
  }

  /** Foreground wiring: network changes and app resume trigger a sync. Returns a disposer. */
  startForeground(): () => void {
    const net = Network.addNetworkStateListener((st) => this.scheduler.networkChanged(Boolean(st.isConnected) && st.isInternetReachable !== false));
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') this.scheduler.resume();
    });
    this.scheduler.resume();
    return () => {
      net.remove();
      app.remove();
      this.scheduler.stop();
    };
  }

  subscribe(fn: (s: QueueSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  get queueSnapshot(): QueueSnapshot {
    return this.snapshot;
  }

  async refreshCounts(): Promise<void> {
    const counts = await this.store.counts(this.session.user?.id);
    this.publish({ ...this.snapshot, counts });
  }

  private publish(s: QueueSnapshot): void {
    this.snapshot = s;
    for (const fn of this.listeners) fn(s);
  }
}

async function isOnline(): Promise<boolean> {
  try {
    const st = await Network.getNetworkStateAsync();
    return Boolean(st.isConnected) && st.isInternetReachable !== false;
  } catch {
    return true; // let the request decide
  }
}

let instance: Promise<Services> | null = null;

export function getServices(): Promise<Services> {
  instance ??= Services.create().catch((err: unknown) => {
    instance = null;
    throw err;
  });
  return instance;
}
