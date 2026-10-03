import { describe, expect, it } from 'vitest';
import { backoffDelay, InMemoryJobQueue, UnrecoverableJobError } from '../src/index.js';

describe('InMemoryJobQueue', () => {
  it('runs jobs, dedupes by jobId and respects concurrency', async () => {
    const q = new InMemoryJobQueue();
    let running = 0;
    let maxRunning = 0;
    const seen: number[] = [];
    q.consume<{ n: number }>(
      'work',
      async (job) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 5));
        seen.push(job.data.n);
        running--;
      },
      { concurrency: 2 },
    );
    await q.enqueue('work', { n: 1 }, { jobId: 'a' });
    await q.enqueue('work', { n: 1 }, { jobId: 'a' }); // duplicate while live
    await q.enqueue('work', { n: 2 });
    await q.enqueue('work', { n: 3 });
    await q.enqueue('work', { n: 4 });
    await q.drain();
    expect(seen.sort()).toEqual([1, 2, 3, 4]);
    expect(maxRunning).toBe(2);
    await q.close();
  });

  it('retries with backoff and reports the final failure once', async () => {
    const q = new InMemoryJobQueue({ backoffScale: 0.001 });
    const attempts: number[] = [];
    const failures: { attempt: number; final: boolean }[] = [];
    q.consume(
      'flaky',
      async (job) => {
        attempts.push(job.attempt);
        throw new Error('boom');
      },
      { concurrency: 1, onFailed: (job, _e, final) => void failures.push({ attempt: job.attempt, final }) },
    );
    await q.enqueue('flaky', {}, { attempts: 3, backoffMs: 10 });
    await q.drain();
    expect(attempts).toEqual([1, 2, 3]);
    expect(failures).toEqual([
      { attempt: 1, final: false },
      { attempt: 2, final: false },
      { attempt: 3, final: true },
    ]);
  });

  it('does not retry unrecoverable errors', async () => {
    const q = new InMemoryJobQueue({ backoffScale: 0.001 });
    let calls = 0;
    let finalSeen = false;
    q.consume('fatal', async () => {
      calls++;
      throw new UnrecoverableJobError('bad input');
    }, { concurrency: 1, onFailed: (_j, _e, final) => void (finalSeen = final) });
    await q.enqueue('fatal', {}, { attempts: 5 });
    await q.drain();
    expect(calls).toBe(1);
    expect(finalSeen).toBe(true);
  });

  it('computes exponential backoff', () => {
    expect([1, 2, 3].map((a) => backoffDelay(1000, a))).toEqual([1000, 2000, 4000]);
  });
});

describe('analyzePhotoJobId', () => {
  it('never contains ":" (BullMQ rejects custom job ids with its key separator)', async () => {
    const { analyzePhotoJobId } = await import('../src/jobs.js');
    expect(analyzePhotoJobId('cmabc123', 'upload')).toBe('analyze-cmabc123');
    expect(analyzePhotoJobId('cmabc123', 'reanalyze', 'n1')).toBe('analyze-cmabc123-n1');
    expect(analyzePhotoJobId('cmabc123', 'reanalyze')).not.toContain(':');
  });
});
