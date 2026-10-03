'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import type { Action, Subject } from '@acceptance/shared';
import { EmptyState } from '@/components/data/states';
import { useCan } from '@/components/session-provider';

/** Page-level guard: a role without the permission sees an explanation instead of broken screens. */
export function RequirePermission({ action, subject, children }: { action: Action; subject: Subject; children: ReactNode }) {
  const t = useTranslations('common');
  const can = useCan();
  if (!can(action, subject)) {
    return <EmptyState icon={<ShieldAlert className="size-9" aria-hidden />} title={t('forbiddenTitle')} description={t('forbiddenBody')} />;
  }
  return <>{children}</>;
}
