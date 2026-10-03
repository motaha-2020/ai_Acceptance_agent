'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Download, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, PageHeader } from '@/components/data/states';
import { getLatestAppRelease } from '@/lib/api/endpoints';
import type { AppLocale } from '@/i18n/config';
import { formatBytes, formatDate } from '@/lib/format';

/** Stub for T5.6: shows the latest Android release when the API provides one, otherwise "coming soon". */
export function AppDownload() {
  const t = useTranslations('app.download');
  const locale = useLocale() as AppLocale;
  const q = useQuery({ queryKey: ['app-release', 'latest'], queryFn: getLatestAppRelease, staleTime: 5 * 60_000 });
  const r = q.data;
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="max-w-2xl">
        <CardHeader className="flex-row items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Smartphone className="size-5" aria-hidden />
          </span>
          <div>
            <CardTitle className="text-base">{t('android')}</CardTitle>
            <CardDescription>{t('androidHint')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {q.isLoading ? (
            <Skeleton className="h-24" />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : r ? (
            <>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t('version')}</dt>
                <dd className="font-medium">
                  <span className="ltr-token">{r.version}</span> <Badge tone="info">{r.channel}</Badge>
                </dd>
                <dt className="text-muted-foreground">{t('published')}</dt>
                <dd>{formatDate(r.publishedAt, locale)}</dd>
                {r.sizeBytes ? (
                  <>
                    <dt className="text-muted-foreground">{t('size')}</dt>
                    <dd>{formatBytes(r.sizeBytes, locale)}</dd>
                  </>
                ) : null}
                {r.minSupportedVersion ? (
                  <>
                    <dt className="text-muted-foreground">{t('minVersion')}</dt>
                    <dd className="ltr-token">{r.minSupportedVersion}</dd>
                  </>
                ) : null}
              </dl>
              {r.changelog ? <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{r.changelog}</p> : null}
              {r.downloadUrl ? (
                <Button asChild size="lg" className="w-fit">
                  <a href={r.downloadUrl} download>
                    <Download aria-hidden />
                    {t('download')}
                  </a>
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">{t('sideload')}</p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">{t('comingSoon')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('comingSoonHint')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
