import { Global, Inject, Injectable, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';
import { createPrismaClient, type PrismaClient } from '@acceptance/db';
import { createJobQueue, type JobQueue } from '@acceptance/queue';
import { createObjectStorage, type ObjectStorage } from '@acceptance/storage';
import { buildProviderRegistry, type ProviderRegistry } from '@acceptance/worker';
import type { AppConfig } from '../config/config.js';
import { CONFIG, LOGGER, PRISMA, PROVIDERS, QUEUE, STORAGE } from './tokens.js';

/** Infrastructure that tests (or other composition roots) may replace. */
export interface InfraOverrides {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  queue?: JobQueue;
  providers?: ProviderRegistry;
}

@Injectable()
class InfraLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(QUEUE) private readonly queue: JobQueue,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({})
export class CoreModule {
  static forRoot(config: AppConfig, logger: Logger, overrides: InfraOverrides = {}): DynamicModule {
    const storage =
      overrides.storage ??
      createObjectStorage({
        ...config,
        STORAGE_LOCAL_DIR: config.storageLocalDir,
        STORAGE_PUBLIC_BASE_URL: config.storagePublicBaseUrl,
      });
    return {
      module: CoreModule,
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: LOGGER, useValue: logger },
        { provide: PRISMA, useFactory: () => overrides.prisma ?? createPrismaClient(config.DATABASE_URL) },
        { provide: STORAGE, useValue: storage },
        { provide: QUEUE, useFactory: () => overrides.queue ?? createJobQueue(config) },
        { provide: PROVIDERS, useFactory: () => overrides.providers ?? buildProviderRegistry() },
        InfraLifecycle,
      ],
      exports: [CONFIG, LOGGER, PRISMA, STORAGE, QUEUE, PROVIDERS],
    };
  }
}
