import { Module } from '@nestjs/common';
import { SitesController, SitesService } from './sites.js';

@Module({ controllers: [SitesController], providers: [SitesService], exports: [SitesService] })
export class SitesModule {}
