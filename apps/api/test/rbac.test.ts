import { describe, expect, it } from 'vitest';
import { Role, type Action } from '@acceptance/shared';
import { defineAbilityFor, whereFor, type AppSubject } from '../src/auth/ability.js';
import { DomainError } from '../src/core/errors.js';

const ability = (role: Role) => defineAbilityFor({ id: `u-${role}`, role });

/** [action, subject] -> roles that may do it (at least on some rows). Everything else must be denied. */
const MATRIX: [Action, AppSubject, Role[]][] = [
  ['create', 'User', ['admin']],
  ['update', 'User', ['admin']],
  ['read', 'User', ['admin', 'pm', 'reviewer', 'engineer', 'technician']],
  ['read', 'AuditLog', ['admin', 'pm']],
  ['create', 'Project', ['admin', 'pm']],
  ['delete', 'Project', ['admin', 'pm']],
  ['create', 'Site', ['admin', 'pm', 'engineer']],
  ['update', 'Device', ['admin', 'pm', 'engineer']],
  ['read', 'Site', ['admin', 'pm', 'reviewer', 'engineer', 'technician', 'viewer']],
  ['create', 'Visit', ['admin', 'pm', 'engineer']],
  ['assign', 'Visit', ['admin', 'pm', 'engineer']],
  ['update', 'Visit', ['admin', 'pm', 'engineer', 'technician']],
  ['upload', 'Visit', ['admin', 'reviewer', 'engineer', 'technician']],
  ['read', 'Photo', ['admin', 'pm', 'reviewer', 'engineer', 'technician', 'viewer']],
  ['review', 'Photo', ['admin', 'reviewer']],
  ['approve', 'Photo', ['admin', 'pm', 'reviewer']],
  ['fix', 'Snag', ['admin', 'engineer', 'technician']],
  ['verify', 'Snag', ['admin', 'pm', 'reviewer']],
  ['read', 'Metrics', ['admin', 'pm', 'reviewer', 'engineer', 'viewer']],
  ['update', 'AutonomyPolicy', ['admin']],
  ['manage', 'all', ['admin']],
];

describe('RBAC matrix', () => {
  for (const [action, subject, allowed] of MATRIX) {
    for (const role of Role.options) {
      const expected = allowed.includes(role);
      it(`${role} ${expected ? 'can' : 'cannot'} ${action} ${subject}`, () => {
        expect(ability(role).can(action, subject)).toBe(expected);
      });
    }
  }

  it('viewer has no write permission at all', () => {
    const a = ability('viewer');
    for (const action of ['create', 'update', 'delete', 'assign', 'upload', 'review', 'approve', 'fix', 'verify'] as Action[]) {
      for (const subject of ['Project', 'Site', 'Device', 'Visit', 'Photo', 'Snag', 'User'] as AppSubject[]) {
        expect(a.can(action, subject), `${action} ${subject}`).toBe(false);
      }
    }
  });
});

describe('row-level scopes', () => {
  it('technicians are limited to visits they are assigned to', () => {
    const a = defineAbilityFor({ id: 'tech-1', role: 'technician' });
    expect(whereFor(a, 'read', 'Visit')).toEqual({ OR: [{ assignments: { some: { userId: 'tech-1' } } }] });
    expect(whereFor(a, 'read', 'Photo')).toEqual({ OR: [{ visit: { assignments: { some: { userId: 'tech-1' } } } }] });
    expect(whereFor(a, 'fix', 'Snag')).toEqual({ OR: [{ photo: { visit: { assignments: { some: { userId: 'tech-1' } } } } }] });
    expect(whereFor(a, 'read', 'User')).toEqual({ OR: [{ id: 'tech-1' }] });
  });

  it('unscoped roles get an unrestricted filter', () => {
    expect(whereFor(ability('reviewer'), 'read', 'Visit')).toEqual({});
  });

  it('a role without any rule for the pair gets 403, not an empty list', () => {
    let err: unknown;
    try {
      whereFor(ability('viewer'), 'read', 'User');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).status).toBe(403);
  });
});
