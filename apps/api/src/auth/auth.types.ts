import type { Role } from '@acceptance/shared';
import type { AppAbility } from './ability.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthContext {
  user: AuthUser;
  ability: AppAbility;
}

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
