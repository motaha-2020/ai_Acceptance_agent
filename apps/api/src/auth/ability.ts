import { AbilityBuilder, ForbiddenError, type PureAbility } from '@casl/ability';
import { accessibleBy, createPrismaAbility, type PrismaQuery, type Subjects } from '@casl/prisma';
import type {
  Analysis,
  AppRelease,
  AuditLog,
  AutonomyPolicy,
  Device,
  Photo,
  Project,
  Report,
  Review,
  Site,
  Snag,
  User,
  Visit,
} from '@acceptance/db';
import { PERMISSION_MATRIX, type Action, type PermissionScope, type Role, type Subject } from '@acceptance/shared';
import { forbidden } from '../core/errors.js';

type ModelSubjects = Subjects<{
  User: User;
  Project: Project;
  Site: Site;
  Device: Device;
  Visit: Visit;
  Photo: Photo;
  Analysis: Analysis;
  Snag: Snag;
  Review: Review;
  AuditLog: AuditLog;
  AutonomyPolicy: AutonomyPolicy;
  Report: Report;
  AppRelease: AppRelease;
}>;

export type AppSubject = ModelSubjects | 'Metrics' | 'all';
export type AppAbility = PureAbility<[Action, AppSubject], PrismaQuery>;
export type ScopedModel = 'User' | 'Project' | 'Site' | 'Device' | 'Visit' | 'Photo' | 'Analysis' | 'Snag' | 'Review' | 'AuditLog' | 'AutonomyPolicy';

export interface AbilityUser {
  id: string;
  role: Role;
}

/**
 * Build the CASL ability for a user from the shared PERMISSION_MATRIX.
 * Scoped rules become Prisma conditions so the same rules drive both permission checks and
 * row-level filtering (`whereFor`).
 */
export function defineAbilityFor(user: AbilityUser): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createPrismaAbility);
  for (const rule of PERMISSION_MATRIX[user.role]) {
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    for (const action of actions) {
      for (const subject of subjects) {
        if (rule.scope) applyScope(builder, action, subject, rule.scope, user.id);
        else builder.can(action, subject);
      }
    }
  }
  return builder.build();
}

function applyScope(b: AbilityBuilder<AppAbility>, action: Action, subject: Subject, scope: PermissionScope, userId: string): void {
  const assigned = { assignments: { some: { userId } } };
  if (scope === 'self' && subject === 'User') {
    b.can(action, 'User', { id: userId });
    return;
  }
  if (scope === 'assigned_visits') {
    switch (subject) {
      case 'Visit':
        b.can(action, 'Visit', assigned);
        return;
      case 'Photo':
        b.can(action, 'Photo', { visit: assigned });
        return;
      case 'Analysis':
        b.can(action, 'Analysis', { photo: { visit: assigned } });
        return;
      case 'Snag':
        b.can(action, 'Snag', { photo: { visit: assigned } });
        return;
      default:
        break;
    }
  }
  throw new Error(`permission scope "${scope}" is not supported for subject ${subject}`);
}

/**
 * Prisma `where` fragment with the rows this ability may `action` on `model`.
 * Throws 403 when the user has no rule at all for the pair.
 */
export function whereFor<M extends ScopedModel>(ability: AppAbility, action: Action, model: M): ReturnType<typeof accessibleBy>[M] {
  try {
    return accessibleBy(ability, action)[model];
  } catch (err) {
    if (err instanceof ForbiddenError) throw forbidden();
    throw err;
  }
}

/** Throws 403 unless the ability allows `action` on `subject` for at least some rows. */
export function assertCan(ability: AppAbility, action: Action, subject: AppSubject): void {
  if (!ability.can(action, subject)) throw forbidden();
}
