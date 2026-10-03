import { Module } from '@nestjs/common';
import { SnagsController } from './snags.controller.js';
import { SnagsService } from './snags.service.js';

@Module({ controllers: [SnagsController], providers: [SnagsService] })
export class SnagsModule {}
