import { PERMISSION_MATRIX, type Action, type Role, type Subject } from '@acceptance/shared';

/**
 * UI-side permission check against the shared matrix (same source the API builds CASL from).
 * Row-level scopes (technician = assigned visits) cannot be evaluated here and count as allowed;
 * the server is the authority and returns 403/404 where it applies.
 */
export function can(role: Role | undefined | null, action: Action, subject: Subject): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[role].some((rule) => {
    if (rule.inverted) return false;
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    return (actions.includes('manage') || actions.includes(action)) && (subjects.includes('all') || subjects.includes(subject));
  });
}
