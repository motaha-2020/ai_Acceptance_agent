import { BarChart3, Building2, FileText, FolderTree, ListChecks, Smartphone, TriangleAlert, Users, type LucideIcon } from 'lucide-react';
import type { Action, Subject } from '@acceptance/shared';

export interface NavItem {
  href: string;
  /** key in messages `nav.*` */
  label: string;
  icon: LucideIcon;
  /** Permission required to see the entry (UI only; the API enforces). */
  needs: { action: Action; subject: Subject };
  group: 'work' | 'insight' | 'admin' | 'other';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/review', label: 'review', icon: ListChecks, needs: { action: 'review', subject: 'Photo' }, group: 'work' },
  { href: '/sites', label: 'sites', icon: Building2, needs: { action: 'read', subject: 'Site' }, group: 'work' },
  { href: '/snags', label: 'snags', icon: TriangleAlert, needs: { action: 'read', subject: 'Snag' }, group: 'work' },
  { href: '/accuracy', label: 'accuracy', icon: BarChart3, needs: { action: 'read', subject: 'Metrics' }, group: 'insight' },
  { href: '/reports', label: 'reports', icon: FileText, needs: { action: 'read', subject: 'Report' }, group: 'insight' },
  { href: '/admin/users', label: 'users', icon: Users, needs: { action: 'create', subject: 'User' }, group: 'admin' },
  { href: '/admin/projects', label: 'projects', icon: FolderTree, needs: { action: 'create', subject: 'Project' }, group: 'admin' },
  { href: '/app', label: 'app', icon: Smartphone, needs: { action: 'read', subject: 'Site' }, group: 'other' },
];

export const NAV_GROUPS: ReadonlyArray<NavItem['group']> = ['work', 'insight', 'admin', 'other'];
