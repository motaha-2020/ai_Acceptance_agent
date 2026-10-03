export * from './port.js';
export { InMemoryJobQueue } from './memory.js';
export { BullMqJobQueue, type BullMqOptions } from './bullmq.js';
export * from './jobs.js';

import { BullMqJobQueue } from './bullmq.js';
import { InMemoryJobQueue } from './memory.js';
import type { JobQueue } from './port.js';

/** BullMQ when REDIS_URL is set, otherwise the in-process queue. */
export function createJobQueue(env: { REDIS_URL?: string; QUEUE_PREFIX?: string }): JobQueue {
  return env.REDIS_URL ? new BullMqJobQueue({ redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX }) : new InMemoryJobQueue();
}
