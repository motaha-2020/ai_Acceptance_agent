import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginRequest, RefreshRequest } from '@acceptance/shared';
import { ApiZodBody, ZBody } from '../core/zod.js';
import { AuthService } from './auth.service.js';
import type { ClientMeta } from './auth.types.js';
import { Audited } from '../audit/audit.decorator.js';
import { Client, Public } from './decorators.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Audited('Auth', { captureBody: ['email'] })
  @ApiOperation({ summary: 'Log in with email + password; returns access + refresh tokens (rate limited)' })
  @ApiZodBody(LoginRequest)
  login(@ZBody(LoginRequest) body: LoginRequest, @Client() client: ClientMeta) {
    return this.auth.login(body, client);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token (the presented token is revoked)' })
  @ApiZodBody(RefreshRequest)
  refresh(@ZBody(RefreshRequest) body: RefreshRequest, @Client() client: ClientMeta) {
    return this.auth.refresh(body.refreshToken, client);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the refresh token family of this login' })
  @ApiZodBody(RefreshRequest)
  async logout(@ZBody(RefreshRequest) body: RefreshRequest): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

}
