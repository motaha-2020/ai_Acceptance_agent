import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller.js';
import { VisitsService } from './visits.service.js';

@Module({ controllers: [VisitsController], providers: [VisitsService], exports: [VisitsService] })
export class VisitsModule {}
