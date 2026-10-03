import { Inject, Injectable, Module, type OnApplicationBootstrap } from '@nestjs/common';
import type { Logger } from 'pino';
import type { PrismaClient } from '@acceptance/db';
import type { JobQueue } from '@acceptance/queue';
import type { ObjectStorage } from '@acceptance/storage';
import { startAnalysisRuntime, startReportRuntime, type ProviderRegistry } from '@acceptance/worker';
import type { AppConfig } from '../config/config.js';
import { CONFIG, LOGGER, PRISMA, PROVIDERS, QUEUE, STORAGE } from '../core/tokens.js';

/**
 * Runs the analyze-photo consumer inside the API process when there is no Redis
 * (development without Docker, integration tests). Production runs apps/worker separately.
 */
@Injectable()
export class EmbeddedWorker implements OnApplicationBootstrap {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(QUEUE) private readonly queue: JobQueue,
    @Inject(PROVIDERS) private readonly providers: ProviderRegistry,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.embeddedWorker) return;
    startAnalysisRuntime({
      prisma: this.prisma,
      storage: this.storage,
      queue: this.queue,
      providers: this.providers,
      logger: this.logger.child({ component: 'embedded-worker' }),
      env: this.config,
    });
    startReportRuntime({ prisma: this.prisma, storage: this.storage, queue: this.queue, logger: this.logger.child({ component: 'embedded-report-worker' }) });
  }
}

@Module({ providers: [EmbeddedWorker] })
export class EmbeddedWorkerModule {}
