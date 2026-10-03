import { Inject, Injectable } from '@nestjs/common';
import { hashPassword, Prisma, type PrismaClient } from '@acceptance/db';
import type { CreateUserRequest, ListUsersQuery, Paginated, UpdateUserRequest } from '@acceptance/shared';
import { whereFor } from '../auth/ability.js';
import type { AuthContext } from '../auth/auth.types.js';
import { TokenService } from '../auth/token.service.js';
import { badRequest, notFound } from '../core/errors.js';
import { pageArgs, toPage } from '../core/pagination.js';
import { PRISMA } from '../core/tokens.js';

/** Public user shape: never exposes the password hash. */
export const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  companyId: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
export type UserDto = Omit<UserRow, 'role'> & { role: UserRow['role']['name'] };

const toDto = (u: UserRow): UserDto => ({ ...u, role: u.role.name });

@Injectable()
export class UsersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async list(auth: AuthContext, q: ListUsersQuery): Promise<Paginated<UserDto>> {
    const where: Prisma.UserWhereInput = {
      AND: [
        whereFor(auth.ability, 'read', 'User'),
        q.role ? { role: { name: q.role } } : {},
        q.isActive !== undefined ? { isActive: q.isActive } : {},
        q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: userSelect, orderBy: { name: 'asc' }, ...pageArgs(q) }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(rows.map(toDto), total, q);
  }

  async get(auth: AuthContext, id: string): Promise<UserDto> {
    const row = await this.prisma.user.findFirst({ where: { AND: [whereFor(auth.ability, 'read', 'User'), { id }] }, select: userSelect });
    if (!row) throw notFound('User', id);
    return toDto(row);
  }

  /** Unscoped lookup (own profile). */
  async byId(id: string): Promise<UserDto> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!row) throw notFound('User', id);
    return toDto(row);
  }

  async create(input: CreateUserRequest): Promise<UserDto> {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: input.role } });
    const row = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone ?? null,
        companyId: input.companyId ?? null,
        roleId: role.id,
        passwordHash: await hashPassword(input.password),
      },
      select: userSelect,
    });
    return toDto(row);
  }

  async update(auth: AuthContext, id: string, input: UpdateUserRequest): Promise<UserDto> {
    if (id === auth.user.id && (input.isActive === false || (input.role && input.role !== auth.user.role))) {
      throw badRequest('SELF_LOCKOUT', 'You cannot deactivate yourself or change your own role');
    }
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('User', id);
    const data: Prisma.UserUpdateInput = {
      name: input.name,
      phone: input.phone,
      isActive: input.isActive,
      company: input.companyId === undefined ? undefined : input.companyId ? { connect: { id: input.companyId } } : { disconnect: true },
      role: input.role ? { connect: { name: input.role } } : undefined,
      passwordHash: input.password ? await hashPassword(input.password) : undefined,
    };
    const row = await this.prisma.user.update({ where: { id }, data, select: userSelect });
    // Security-relevant changes end every session of the user.
    if (input.password || input.role || input.isActive === false) await this.tokens.revokeAllForUser(id);
    return toDto(row);
  }

  async deactivate(auth: AuthContext, id: string): Promise<UserDto> {
    return this.update(auth, id, { isActive: false });
  }

  async roles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, description: true, permissions: { select: { action: true, subject: true, conditions: true }, orderBy: [{ subject: 'asc' }, { action: 'asc' }] } },
    });
  }
}
