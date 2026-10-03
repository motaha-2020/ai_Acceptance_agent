import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LocalObjectStorage, ObjectNotFoundError, type ObjectStorage } from '@acceptance/storage';
import { Public } from '../auth/decorators.js';
import { DomainError, notFound } from '../core/errors.js';
import { STORAGE } from '../core/tokens.js';

/**
 * Serves objects of the local storage driver through HMAC-signed, expiring URLs
 * (the S3 driver hands out presigned MinIO URLs instead, so this route returns 404 there).
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  constructor(@Inject(STORAGE) private readonly storage: ObjectStorage) {}

  @Public()
  @Get('*')
  async get(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
    @Query('dn') dn?: string,
  ): Promise<void> {
    if (!(this.storage instanceof LocalObjectStorage)) throw notFound('File');
    const params = req.params as Record<string, string | undefined>;
    const key = decodeURIComponent(params['*'] ?? params['path'] ?? '');
    const verified = this.storage.verifySignature(key, exp, sig, dn);
    if (!verified) throw new DomainError(403, 'INVALID_SIGNATURE', 'Link is invalid or expired');
    try {
      const data = await this.storage.get(key);
      void reply
        .header('content-type', await this.storage.contentType(key))
        .header('cache-control', 'private, max-age=300')
        .header('x-content-type-options', 'nosniff');
      if (verified.downloadName) void reply.header('content-disposition', `attachment; filename="${verified.downloadName.replace(/["\r\n]/g, '')}"`);
      await reply.send(data);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) throw notFound('File');
      throw err;
    }
  }
}
