import multipart from '@fastify/multipart';
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Logger } from 'pino';
import { AppReleasesModule } from './app-releases/app-releases.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import type { AppConfig } from './config/config.js';
import { CoreModule, type InfraOverrides } from './core/core.module.js';
import { GlobalErrorFilter } from './core/error.filter.js';
import { createLogger, PinoNestLogger } from './core/logger.js';
import { DevicesModule } from './devices/devices.module.js';
import { HealthModule } from './health/health.js';
import { MetricsModule } from './metrics/metrics.js';
import { PhotosModule } from './photos/photos.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { SitesModule } from './sites/sites.module.js';
import { SnagsModule } from './snags/snags.module.js';
import { UsersModule } from './users/users.module.js';
import { VisitsModule } from './visits/visits.module.js';
import { EmbeddedWorkerModule } from './worker/embedded-worker.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, logger: Logger, overrides: InfraOverrides = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(config, logger, overrides),
        AuthModule,
        AuditModule,
        UsersModule,
        ProjectsModule,
        SitesModule,
        DevicesModule,
        VisitsModule,
        PhotosModule,
        ReviewsModule,
        SnagsModule,
        MetricsModule,
        HealthModule,
        AppReleasesModule,
        ReportsModule,
        EmbeddedWorkerModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: GlobalErrorFilter }],
    };
  }
}

export interface CreateAppOptions {
  overrides?: InfraOverrides;
  logger?: Logger;
}

/** Composition root shared by main.ts, the OpenAPI exporter and the integration tests. */
export async function createApp(config: AppConfig, opts: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const logger = opts.logger ?? createLogger(config);
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    genReqId: (req: IncomingMessage) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    },
    trustProxy: true, // behind Caddy
    bodyLimit: 1024 * 1024,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config, logger, opts.overrides), adapter, {
    logger: new PinoNestLogger(logger),
    bufferLogs: false,
  });
  await app.register(multipart, { limits: { fileSize: config.UPLOAD_MAX_BYTES, files: 1 } });
  app.enableCors({ origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false, credentials: false });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready', 'files/*path'] });
  if (config.SWAGGER_ENABLED) {
    SwaggerModule.setup('docs', app, buildOpenApi(app), { jsonDocumentUrl: 'docs-json' });
  }
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export function buildOpenApi(app: NestFastifyApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('Acceptance System API')
    .setDescription(
      'Telecom install acceptance: sites, visits, photo capture, AI inspection, human review and snag tracking. ' +
        'Errors use { statusCode, error: { code, message, details }, requestId }.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  return SwaggerModule.createDocument(app, doc);
}
