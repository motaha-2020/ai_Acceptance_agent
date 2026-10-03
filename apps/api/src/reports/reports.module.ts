import { Module } from '@nestjs/common';
import { ReportsController, SiteReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { SiteDocumentsService } from './site-documents.service.js';

@Module({ controllers: [SiteReportsController, ReportsController], providers: [ReportsService, SiteDocumentsService] })
export class ReportsModule {}
