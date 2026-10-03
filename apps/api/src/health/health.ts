import { Controller, Get, Inject, Module, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@acceptance/db';
import type { JobQueue } from '@acceptance/queue';
import type { ObjectStorage } from '@acceptance/storage';
import { Public } from '../auth/decorators.js';
import { PRISMA, QUEUE, STORAGE } from '../core/tokens.js';

type Check = { status: 'up' | 'down'; error?: string };

async function probe(fn: () => Promise<unknown>, timeoutMs = 3000): Promise<Check> {
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))]);
    return { status: 'up' };
  } catch (err) {
    return { status: 'down', error: err instanceof Error ? err.message : String(err) };
  }
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(QUEUE) private readonly queue: JobQueue,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is up' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: database, object storage and queue reachable (503 otherwise)' })
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const [database, storage, queue] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.storage.ping()),
      probe(() => this.queue.ping()),
    ]);
    const checks = { database, storage: { ...storage, driver: this.storage.kind }, queue: { ...queue, driver: this.queue.kind } };
    const ok = [database, storage, queue].every((c) => c.status === 'up');
    void reply.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', checks };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
