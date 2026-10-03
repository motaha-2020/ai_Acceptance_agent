'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useErrorMessage } from '@/lib/errors';

export function EmptyState({ title, description, action, icon, className }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center', className)}>
      <div className="text-muted-foreground">{icon ?? <Inbox className="size-8" aria-hidden />}</div>
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const t = useTranslations('common');
  const message = useErrorMessage();
  const forbidden = error instanceof ApiRequestError && error.status === 403;
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-st-danger-bg bg-st-danger-bg/40 px-6 py-10 text-center', className)}>
      <AlertCircle className="size-7 text-st-danger-fg" aria-hidden />
      <p className="font-medium">{forbidden ? t('forbiddenTitle') : t('errorTitle')}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message(error)}</p>
      {onRetry && !forbidden ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw aria-hidden />
          {t('retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 6, className }: { rows?: number; className?: string }) {
  const t = useTranslations('common');
  return (
    <div role="status" aria-label={t('loading')} className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
