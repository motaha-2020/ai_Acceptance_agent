import type { SyncSummary } from './sync-engine';

/** UI-facing sync state (shown in the queue badge / screen). Pure reducer, tested in isolation. */
export type SyncState =
  | { phase: 'idle'; lastSyncAt: number | null }
  | { phase: 'syncing'; lastSyncAt: number | null }
  | { phase: 'offline'; lastSyncAt: number | null }
  | { phase: 'waiting'; until: number; lastSyncAt: number | null }
  | { phase: 'auth_required'; lastSyncAt: number | null }
  | { phase: 'error'; message: string; lastSyncAt: number | null };

export type SyncEvent =
  | { type: 'start' }
  | { type: 'finished'; summary: SyncSummary; at: number }
  | { type: 'crashed'; message: string }
  | { type: 'network'; online: boolean }
  | { type: 'logged_in' }
  | { type: 'logged_out' };

export const initialSyncState: SyncState = { phase: 'idle', lastSyncAt: null };

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  const lastSyncAt = state.lastSyncAt;
  switch (event.type) {
    case 'start':
      // An expired login blocks syncing until the user logs in again.
      if (state.phase === 'auth_required') return state;
      return { phase: 'syncing', lastSyncAt };
    case 'finished': {
      const at = event.at;
      switch (event.summary.stoppedBecause) {
        case 'drained':
        case 'aborted':
          return { phase: 'idle', lastSyncAt: at };
        case 'waiting':
          return event.summary.nextWakeAt !== null ? { phase: 'waiting', until: event.summary.nextWakeAt, lastSyncAt: at } : { phase: 'idle', lastSyncAt: at };
        case 'offline':
          return { phase: 'offline', lastSyncAt };
        case 'auth':
        case 'no_user':
          return { phase: 'auth_required', lastSyncAt };
      }
      return state;
    }
    case 'crashed':
      return { phase: 'error', message: event.message, lastSyncAt };
    case 'network':
      if (!event.online) return state.phase === 'auth_required' ? state : { phase: 'offline', lastSyncAt };
      return state.phase === 'offline' ? { phase: 'idle', lastSyncAt } : state;
    case 'logged_in':
      return state.phase === 'auth_required' ? { phase: 'idle', lastSyncAt } : state;
    case 'logged_out':
      return { phase: 'auth_required', lastSyncAt };
  }
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/**
 * Decides when to run the engine: on demand (capture, app foreground, network back online) and
 * at the time the earliest backed-off item becomes ready. Never runs two drains at once.
 */
export class SyncScheduler {
  private timer: unknown = null;
  private state: SyncState = initialSyncState;
  private pending = false;
  private active = false;
  private stopped = false;

  constructor(
    private readonly runOnce: () => Promise<SyncSummary>,
    private readonly timers: Timers,
    private readonly onState: (s: SyncState) => void = () => undefined,
    /** Upper bound between runs while items are waiting (also covers clock changes). */
    private readonly maxSleepMs = 5 * 60_000,
  ) {}

  get current(): SyncState {
    return this.state;
  }

  dispatch(event: SyncEvent): void {
    this.state = syncReducer(this.state, event);
    this.onState(this.state);
  }

  /** Request a run soon; coalesces with a run in progress. */
  trigger(): void {
    if (this.stopped) return;
    if (this.active) {
      this.pending = true;
      return;
    }
    void this.execute();
  }

  networkChanged(online: boolean): void {
    this.dispatch({ type: 'network', online });
    if (online) this.trigger();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  resume(): void {
    this.stopped = false;
    this.trigger();
  }

  private async execute(): Promise<void> {
    if (this.state.phase === 'auth_required') return;
    this.active = true;
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    this.dispatch({ type: 'start' });
    try {
      const summary = await this.runOnce();
      this.dispatch({ type: 'finished', summary, at: this.timers.now() });
      if (summary.nextWakeAt !== null && summary.stoppedBecause === 'waiting') {
        const delay = Math.max(0, Math.min(this.maxSleepMs, summary.nextWakeAt - this.timers.now()));
        this.timer = this.timers.setTimeout(() => {
          this.timer = null;
          this.trigger();
        }, delay);
      }
    } catch (err) {
      this.dispatch({ type: 'crashed', message: err instanceof Error ? err.message : String(err) });
      this.timer = this.timers.setTimeout(() => {
        this.timer = null;
        this.trigger();
      }, 60_000);
    } finally {
      this.active = false;
    }
    if (this.pending && !this.stopped) {
      this.pending = false;
      void this.execute();
    }
  }
}
