import { Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RejectPhotoRequest, ReviewQueueQuery, SubmitReviewRequest } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy } from '../auth/decorators.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get('reviews/queue')
  @CheckPolicy('review', 'Photo')
  @ApiOperation({ summary: 'Review queue: photos awaiting a decision, oldest first, with latest AI result and active snags' })
  @ApiZodQuery(ReviewQueueQuery)
  queue(@ZQuery(ReviewQueueQuery) q: ReviewQueueQuery) {
    return this.reviews.queue(q);
  }

  @Post('photos/:id/reviews')
  @CheckPolicy('review', 'Photo')
  @Audited('Photo')
  @ApiOperation({ summary: 'Submit a review (agree / override / add_snag); stored as an immutable training label' })
  @ApiIdParam()
  @ApiZodBody(SubmitReviewRequest)
  submit(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(SubmitReviewRequest) body: SubmitReviewRequest) {
    return this.reviews.submit(auth, id, body);
  }

  @Post('photos/:id/approve')
  @HttpCode(200)
  @CheckPolicy('approve', 'Photo')
  @Audited('Photo')
  @ApiOperation({ summary: 'Approve a photo (no unresolved snags allowed)' })
  @ApiIdParam()
  approve(@Auth() auth: AuthContext, @IdParam() id: string) {
    return this.reviews.approve(auth, id);
  }

  @Post('photos/:id/reject')
  @HttpCode(200)
  @CheckPolicy('approve', 'Photo')
  @Audited('Photo', { captureBody: ['reason'] })
  @ApiOperation({ summary: 'Reject a photo; its open snags go to the technician for fixing' })
  @ApiIdParam()
  @ApiZodBody(RejectPhotoRequest)
  reject(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(RejectPhotoRequest) body: RejectPhotoRequest) {
    return this.reviews.reject(auth, id, body.reason);
  }
}
