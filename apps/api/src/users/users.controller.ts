import { Controller, Get, HttpCode, Inject, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserRequest, ListUsersQuery, UpdateUserRequest } from '@acceptance/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CheckPolicy } from '../auth/decorators.js';
import { Audited } from '../audit/audit.decorator.js';
import { ApiIdParam, ApiZodBody, ApiZodQuery, IdParam, ZBody, ZQuery } from '../core/zod.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get('auth/me')
  @ApiOperation({ summary: 'Current user with role and permission rules' })
  async me(@Auth() auth: AuthContext) {
    const user = await this.users.byId(auth.user.id);
    return { ...user, rules: auth.ability.rules };
  }

  @Get('users')
  @CheckPolicy('read', 'User')
  @ApiZodQuery(ListUsersQuery)
  list(@Auth() auth: AuthContext, @ZQuery(ListUsersQuery) q: ListUsersQuery) {
    return this.users.list(auth, q);
  }

  @Get('users/:id')
  @CheckPolicy('read', 'User')
  @ApiIdParam()
  get(@Auth() auth: AuthContext, @IdParam() id: string) {
    return this.users.get(auth, id);
  }

  @Post('users')
  @CheckPolicy('create', 'User')
  @Audited('User')
  @ApiOperation({ summary: 'Create a user (admin)' })
  @ApiZodBody(CreateUserRequest)
  create(@ZBody(CreateUserRequest) body: CreateUserRequest) {
    return this.users.create(body);
  }

  @Patch('users/:id')
  @CheckPolicy('update', 'User')
  @Audited('User')
  @ApiIdParam()
  @ApiZodBody(UpdateUserRequest)
  update(@Auth() auth: AuthContext, @IdParam() id: string, @ZBody(UpdateUserRequest) body: UpdateUserRequest) {
    return this.users.update(auth, id, body);
  }

  @Post('users/:id/deactivate')
  @HttpCode(200)
  @CheckPolicy('update', 'User')
  @Audited('User')
  @ApiOperation({ summary: 'Deactivate a user and revoke their sessions (users are never hard-deleted)' })
  @ApiIdParam()
  deactivate(@Auth() auth: AuthContext, @IdParam() id: string) {
    return this.users.deactivate(auth, id);
  }

  @Get('roles')
  @CheckPolicy('read', 'User')
  @ApiOperation({ summary: 'Roles with their permission matrix' })
  roles() {
    return this.users.roles();
  }
}
