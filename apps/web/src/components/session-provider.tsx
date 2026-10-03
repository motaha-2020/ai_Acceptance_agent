'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Action, Subject } from '@acceptance/shared';
import type { Me } from '@/lib/api/types';
import { can } from '@/lib/rbac';

const SessionContext = createContext<Me | null>(null);

export function SessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <SessionContext.Provider value={me}>{children}</SessionContext.Provider>;
}

export function useSession(): Me {
  const me = useContext(SessionContext);
  if (!me) throw new Error('useSession must be used inside <SessionProvider>');
  return me;
}

/** `const can = useCan(); can('review', 'Photo')` — hides actions the role cannot do (server still enforces). */
export function useCan(): (action: Action, subject: Subject) => boolean {
  const me = useContext(SessionContext);
  const role = me?.role;
  return useCallback((action: Action, subject: Subject) => can(role, action, subject), [role]);
}

export function Can({ action, subject, children, fallback = null }: { action: Action; subject: Subject; children: ReactNode; fallback?: ReactNode }) {
  const check = useCan();
  return <>{check(action, subject) ? children : fallback}</>;
}

export function useIsAllowed(action: Action, subject: Subject): boolean {
  const check = useCan();
  return useMemo(() => check(action, subject), [check, action, subject]);
}
