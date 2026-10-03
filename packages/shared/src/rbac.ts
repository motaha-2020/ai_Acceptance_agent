import { z } from 'zod';
import type { Role } from './enums.js';

/**
 * RBAC matrix (single source of truth). The API turns it into CASL abilities and adds
 * row-level conditions; web/mobile can use it to show or hide actions.
 */
export const Action = z.enum([
  'manage', // any action
  'read',
  'create',
  'update',
  'delete',
  'assign', // assign technicians to a visit
  'upload', // upload photos to a visit
  'review', // submit a review (training label)
  'approve', // approve / reject a photo
  'fix', // mark a snag fixed with a new photo
  'verify', // verify / reopen a fixed snag
]);
export type Action = z.infer<typeof Action>;

export const Subject = z.enum([
  'all',
  'User',
  'Project',
  'Site',
  'Device',
  'Visit',
  'Photo',
  'Analysis',
  'Snag',
  'Review',
  'Metrics',
  'AuditLog',
  'AutonomyPolicy',
  'Report',
  'AppRelease',
]);
export type Subject = z.infer<typeof Subject>;

/** Row-level scopes the API resolves to DB conditions for the current user. */
export type PermissionScope = 'assigned_visits' | 'self';

export interface PermissionRule {
  action: Action | Action[];
  subject: Subject | Subject[];
  scope?: PermissionScope;
  inverted?: boolean;
}

const READ_DOMAIN: Subject[] = ['Project', 'Site', 'Device', 'Visit', 'Photo', 'Analysis', 'Snag', 'Review', 'Metrics', 'Report'];

export const PERMISSION_MATRIX: Record<Role, PermissionRule[]> = {
  admin: [{ action: 'manage', subject: 'all' }],
  pm: [
    { action: 'read', subject: [...READ_DOMAIN, 'User', 'AuditLog', 'AutonomyPolicy', 'AppRelease'] },
    { action: ['create', 'update', 'delete'], subject: ['Project', 'Site', 'Device', 'Visit'] },
    { action: 'assign', subject: 'Visit' },
    { action: 'create', subject: 'Report' },
    { action: 'approve', subject: 'Photo' },
    { action: 'verify', subject: 'Snag' },
  ],
  reviewer: [
    { action: 'read', subject: [...READ_DOMAIN, 'AutonomyPolicy'] },
    { action: 'read', subject: 'User' },
    { action: 'review', subject: 'Photo' },
    { action: 'approve', subject: 'Photo' },
    // Bulk upload of photos into any open visit (ADR 0005, owner decision 2026-10-03).
    { action: 'upload', subject: 'Visit' },
    { action: ['create', 'update'], subject: 'Snag' },
    { action: 'verify', subject: 'Snag' },
    { action: 'create', subject: 'Report' },
  ],
  engineer: [
    { action: 'read', subject: [...READ_DOMAIN, 'User'] },
    { action: ['create', 'update'], subject: ['Site', 'Device', 'Visit'] },
    { action: 'assign', subject: 'Visit' },
    { action: 'upload', subject: 'Visit' },
    { action: 'fix', subject: 'Snag' },
  ],
  technician: [
    { action: 'read', subject: ['Project', 'Site', 'Device'] },
    { action: 'read', subject: ['Visit', 'Photo', 'Analysis', 'Snag'], scope: 'assigned_visits' },
    { action: 'update', subject: 'Visit', scope: 'assigned_visits' },
    { action: 'upload', subject: 'Visit', scope: 'assigned_visits' },
    { action: 'fix', subject: 'Snag', scope: 'assigned_visits' },
    { action: 'read', subject: 'User', scope: 'self' },
  ],
  viewer: [{ action: 'read', subject: READ_DOMAIN }],
};
