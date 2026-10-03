import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [TokenService, AuthService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
