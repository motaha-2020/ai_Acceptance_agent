import { Module } from '@nestjs/common';
import { ProjectsController, ProjectsService } from './projects.js';

@Module({ controllers: [ProjectsController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
