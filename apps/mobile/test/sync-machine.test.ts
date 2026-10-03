import { describe, expect, it } from 'vitest';
import type { SyncSummary } from '../src/features/queue/sync-engine';
import { initialSyncState, SyncScheduler, syncReducer, type SyncState, type Timers } from '../src/features/queue/sync-machine';

const summary = (over: Partial<SyncSummary> = {}): SyncSummary => ({
  uploaded: 0,
  linked: 0,
  retried: 0,
  failed: 0,
  stoppedBecause: 'drained',
  nextWakeAt: null,
  ...over,
});

describe('sync state reducer', () => {
  it('idle -> syncing -> idle/waiting/offline/auth', () => {
    const s1 = syncReducer(initialSyncState, { type: 'start' });
    expect(s1.phase).toBe('syncing');
    expect(syncReducer(s1, { type: 'finished', summary: summary(), at: 5 })).toEqual({ phase: 'idle', lastSyncAt: 5 });
    expect(syncReducer(s1, { type: 'finished', summary: summary({ stoppedBecause: 'waiting', nextWakeAt: 99 }), at: 5 })).toEqual({
      phase: 'waiting',
      until: 99,
      lastSyncAt: 5,
    });
    expect(syncReducer(s1, { type: 'finished', summary: summary({ stoppedBecause: 'offline' }), at: 5 }).phase).toBe('offline');
    expect(syncReducer(s1, { type: 'finished', summary: summary({ stoppedBecause: 'auth' }), at: 5 }).phase).toBe('auth_required');
  });

  it('auth_required is sticky until login', () => {
    let s: SyncState = { phase: 'auth_required', lastSyncAt: null };
    s = syncReducer(s, { type: 'start' });
    expect(s.phase).toBe('auth_required');
    s = syncReducer(s, { type: 'network', online: false });
    expect(s.phase).toBe('auth_required');
    s = syncReducer(s, { type: 'logged_in' });
    expect(s.phase).toBe('idle');
  });

  it('network events toggle offline', () => {
    const off = syncReducer(initialSyncState, { type: 'network', online: false });
    expect(off.phase).toBe('offline');
    expect(syncReducer(off, { type: 'network', online: true }).phase).toBe('idle');
    expect(syncReducer(initialSyncState, { type: 'crashed', message: 'x' })).toEqual({ phase: 'error', message: 'x', lastSyncAt: null });
  });
});

class FakeTimers implements Timers {
  t = 0;
  queue: Array<{ at: number; fn: () => void; id: number }> = [];
  private id = 0;
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.id;
    this.queue.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown) {
    this.queue = this.queue.filter((q) => q.id !== h);
  }
  now() {
    return this.t;
  }
  async advance(ms: number) {
    this.t += ms;
    const due = this.queue.filter((q) => q.at <= this.t);
    this.queue = this.queue.filter((q) => q.at > this.t);
    for (const d of due) d.fn();
    await flush();
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('sync scheduler', () => {
  it('coalesces triggers while a run is in progress (one extra run, never parallel)', async () => {
    const timers = new FakeTimers();
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    let release: () => void = () => undefined;
    const sched = new SyncScheduler(async () => {
      runs += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((r) => (release = r));
      active -= 1;
      return summary();
    }, timers);
    sched.trigger();
    sched.trigger();
    sched.trigger();
    await flush();
    release();
    await flush();
    await flush();
    release();
    await flush();
    expect(runs).toBe(2);
    expect(maxActive).toBe(1);
    expect(sched.current.phase).toBe('idle');
  });

  it('wakes up when the earliest backed-off item is due', async () => {
    const timers = new FakeTimers();
    const results = [summary({ stoppedBecause: 'waiting', nextWakeAt: 30_000 }), summary({ uploaded: 1 })];
    let runs = 0;
    const sched = new SyncScheduler(async () => results[runs++] ?? summary(), timers);
    sched.trigger();
    await flush();
    expect(sched.current).toMatchObject({ phase: 'waiting', until: 30_000 });
    await timers.advance(29_000);
    expect(runs).toBe(1);
    await timers.advance(1_000);
    expect(runs).toBe(2);
    expect(sched.current.phase).toBe('idle');
  });

  it('caps the sleep so a far-away retry is still re-evaluated', async () => {
    const timers = new FakeTimers();
    let runs = 0;
    const sched = new SyncScheduler(async () => {
      runs += 1;
      return summary({ stoppedBecause: 'waiting', nextWakeAt: 10 * 3600_000 });
    }, timers, undefined, 60_000);
    sched.trigger();
    await flush();
    await timers.advance(60_000);
    expect(runs).toBe(2);
    sched.stop();
    await timers.advance(60_000);
    expect(runs).toBe(2);
  });

  it('network back online triggers a run; auth_required blocks runs until login', async () => {
    const timers = new FakeTimers();
    const outcomes = [summary({ stoppedBecause: 'auth' }), summary()];
    let runs = 0;
    const sched = new SyncScheduler(async () => outcomes[runs++] ?? summary(), timers);
    sched.networkChanged(true);
    await flush();
    expect(sched.current.phase).toBe('auth_required');
    sched.trigger();
    await flush();
    expect(runs).toBe(1);
    sched.dispatch({ type: 'logged_in' });
    sched.trigger();
    await flush();
    expect(runs).toBe(2);
  });

  it('a crashed run is retried a minute later', async () => {
    const timers = new FakeTimers();
    let runs = 0;
    const sched = new SyncScheduler(async () => {
      runs += 1;
      if (runs === 1) throw new Error('db locked');
      return summary();
    }, timers);
    sched.trigger();
    await flush();
    expect(sched.current).toMatchObject({ phase: 'error', message: 'db locked' });
    await timers.advance(60_000);
    expect(runs).toBe(2);
  });
});
