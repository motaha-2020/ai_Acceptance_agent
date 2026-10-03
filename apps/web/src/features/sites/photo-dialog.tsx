'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PhotoStatusBadge, SeverityBadge, SnagStatusBadge, VerdictBadge } from '@/components/data/status-badges';
import { ErrorState } from '@/components/data/states';
import { PhotoViewer, type ViewerBox } from '@/features/review/photo-viewer';
import { useCan } from '@/components/session-provider';
import { getPhoto } from '@/lib/api/endpoints';
import type { AppLocale } from '@/i18n/config';
import { formatDateTime } from '@/lib/format';
import { categoryTitle, snagTitles } from '@/lib/taxonomy';

/** Read-only photo detail: large image with snag boxes, AI verdict, snags and rejection reason. */
export function PhotoDialog({ photoId, onClose }: { photoId: string | null; onClose: () => void }) {
  const t = useTranslations('photo');
  const locale = useLocale() as AppLocale;
  const can = useCan();
  const [showBoxes, setShowBoxes] = useState(true);
  const q = useQuery({ queryKey: ['photo', photoId], queryFn: () => getPhoto(photoId as string), enabled: !!photoId, staleTime: 60_000 });
  const p = q.data;
  const active = useMemo(() => (p?.snags ?? []).filter((s) => !s.dismissedAt), [p]);
  const boxes: ViewerBox[] = active.flatMap((s) => (s.bbox ? [{ id: s.id, bbox: s.bbox, tone: s.source === 'human' ? ('human' as const) : s.severity, label: snagTitles(s.code, locale, s).primary }] : []));
  const analysis = p?.analyses[0];

  return (
    <Dialog open={!!photoId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{p ? categoryTitle(p.category, locale) : t('title')}</DialogTitle>
          <DialogDescription>{p ? formatDateTime(p.capturedAt ?? p.uploadedAt, locale) : t('loading')}</DialogDescription>
        </DialogHeader>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !p ? (
          <Skeleton className="h-[50vh]" />
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
            <PhotoViewer
              className="h-[55vh]"
              src={p.urls.web}
              alt={categoryTitle(p.category, locale)}
              width={p.width}
              height={p.height}
              boxes={boxes}
              showBoxes={showBoxes}
              onToggleBoxes={() => setShowBoxes((v) => !v)}
              drawing={false}
              onDraw={() => undefined}
            />
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <PhotoStatusBadge status={p.status} />
                {analysis ? <VerdictBadge verdict={analysis.verdict} /> : null}
              </div>
              {p.rejectionReason ? (
                <p className="rounded-md bg-st-danger-bg p-2 text-st-danger-fg">
                  <span className="font-medium">{t('rejectionReason')}:</span> {p.rejectionReason}
                </p>
              ) : null}
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('snags')}</h3>
                {active.length === 0 ? (
                  <p className="text-muted-foreground">{t('noSnags')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {active.map((s) => {
                      const titles = snagTitles(s.code, locale, s);
                      return (
                        <li key={s.id} className="rounded-md border p-2">
                          <p className="font-medium">{titles.primary}</p>
                          <p className="text-xs text-muted-foreground" lang={locale === 'ar' ? 'en' : 'ar'}>
                            {titles.secondary}
                          </p>
                          <div className="mt-1 flex gap-1.5">
                            <SeverityBadge severity={s.severity} />
                            <SnagStatusBadge status={s.status} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {can('review', 'Photo') && (p.status === 'pending_review' || p.status === 'fixed') ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/review?siteId=${p.siteId}&category=${p.category}${p.status === 'fixed' ? '&status=fixed' : ''}`}>
                    <ExternalLink aria-hidden />
                    {t('openInReview')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
