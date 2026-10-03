import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({ imports: [PhotosModule], controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
