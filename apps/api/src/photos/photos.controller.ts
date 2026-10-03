import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {} from '@fastify/multipart'; // request.parts() typings
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConfirmCategoriesRequest, ListPhotosQuery, UploadPhotoMetadata } from '@acceptance/shared';
import { Audited } from '../audit/audit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy } from '../auth/decorators.js';
import type { AppConfig } from '../config/config.js';
import { badRequest, DomainError } from '../core/errors.js';
import { CONFIG } from '../core/tokens.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, toOpenApi, ZBody, ZQuery } from '../core/zod.js';
import { PhotosService, type UploadedFile } from './photos.service.js';

@ApiTags('photos')
@ApiBearerAuth()
@Controller('photos')
export class PhotosController {
  constructor(
    @Inject(PhotosService) private readonly photos: PhotosService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @CheckPolicy('upload', 'Visit')
  @Audited('Photo')
  @ApiOperation({
    summary: 'Upload one photo (multipart: `metadata` JSON field + `file`). Idempotent per metadata.clientUuid',
    description: '201 when a photo was created; 200 with `duplicate` when the same capture (clientUuid) or identical bytes in the same visit already exist.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['metadata', 'file'],
      properties: { metadata: { ...toOpenApi(UploadPhotoMetadata), description: 'JSON string' }, file: { type: 'string', format: 'binary' } },
    },
  })
  async upload(@Auth() auth: AuthContext, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const { file, metadata } = await this.readMultipart(req);
    const result = await this.photos.upload(auth, file, metadata);
    void reply.status(result.created ? 201 : 200);
    return result;
  }

  @Get()
  @CheckPolicy('read', 'Photo')
  @ApiZodQuery(ListPhotosQuery)
  list(@Auth() auth: AuthContext, @ZQuery(ListPhotosQuery) q: ListPhotosQuery) {
    return this.photos.list(auth, q);
  }

  @Get(':id')
  @CheckPolicy('read', 'Photo')
  @ApiOperation({ summary: 'Photo with signed URLs, EXIF, analyses, snags and review history' })
  @ApiIdParam()
  get(@Auth() auth: AuthContext, @IdParam() id: string) {
    return this.photos.get(auth, id);
  }

  @Post('confirm-categories')
  @HttpCode(200)
  @CheckPolicy('upload', 'Visit')
  @Audited('Photo')
  @ApiOperation({ summary: 'Bulk upload: confirm or correct AI-proposed categories; confirmed photos are then analysed' })
  @ApiZodBody(ConfirmCategoriesRequest)
  confirmCategories(@Auth() auth: AuthContext, @ZBody(ConfirmCategoriesRequest) body: ConfirmCategoriesRequest) {
    return this.photos.confirmCategories(auth, body);
  }

  @Post('requeue-stuck')
  @HttpCode(200)
  @CheckPolicy('manage', 'all')
  @ApiOperation({ summary: 'Admin: enqueue analysis for photos stuck in `uploaded` for > 10 minutes' })
  requeueStuck() {
    return this.photos.requeueStuck();
  }

  @Post(':id/reanalyze')
  @HttpCode(200)
  @CheckPolicy('manage', 'all')
  @Audited('Photo')
  @ApiOperation({ summary: 'Admin: run AI analysis again for a photo awaiting review' })
  @ApiIdParam()
  reanalyze(@IdParam() id: string) {
    return this.photos.reanalyze(id);
  }

  private async readMultipart(req: FastifyRequest): Promise<{ file: UploadedFile; metadata: unknown }> {
    if (!req.isMultipart()) throw new DomainError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use multipart/form-data');
    let file: UploadedFile | undefined;
    let metadataText: string | undefined;
    const parts = req.parts({ limits: { fileSize: this.config.UPLOAD_MAX_BYTES, files: 1, fields: 4, fieldSize: 64 * 1024 } });
    for await (const part of parts) {
      if (part.type === 'file') {
        const data = await part.toBuffer(); // throws 413 above UPLOAD_MAX_BYTES
        if (part.fieldname !== 'file' || file) throw badRequest('INVALID_MULTIPART', 'Send exactly one file in the `file` field');
        file = { data, filename: part.filename, mimetype: part.mimetype };
      } else if (part.fieldname === 'metadata') {
        metadataText = String(part.value);
      }
    }
    if (!file) throw badRequest('INVALID_MULTIPART', 'Missing `file` part');
    if (!metadataText) throw badRequest('INVALID_MULTIPART', 'Missing `metadata` part');
    try {
      return { file, metadata: JSON.parse(metadataText) as unknown };
    } catch {
      throw badRequest('INVALID_MULTIPART', '`metadata` must be valid JSON');
    }
  }
}
