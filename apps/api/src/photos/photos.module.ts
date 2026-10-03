import { Module } from '@nestjs/common';
import { FilesController } from './files.controller.js';
import { PhotoPresenter } from './photo-presenter.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  controllers: [PhotosController, FilesController],
  providers: [PhotosService, PhotoPresenter],
  exports: [PhotosService, PhotoPresenter],
})
export class PhotosModule {}
