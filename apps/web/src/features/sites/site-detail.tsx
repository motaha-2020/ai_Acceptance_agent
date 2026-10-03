'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, Cpu, ListChecks, MapPin, Plus, Users } from 'lucide-react';
import { PhotoStatus } from '@acceptance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ALL, FilterSelect, pickValue } from '@/components/data/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/data/states';
import { DataTable, type Column } from '@/components/data/data-table';
import { PhotoStatusBadge, VisitStatusBadge } from '@/components/data/status-badges';
import { useCan } from '@/components/session-provider';
import { SnagTracker } from '@/features/snags/snag-tracker';
import { getSite, listPhotos, listVisits } from '@/lib/api/endpoints';
import type { PhotoCategoryDto, PhotoDto, PhotoStatusDto, VisitDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';
import { CATEGORIES, categoryTitle } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import { PhotoDialog } from './photo-dialog';
import { AssignTechniciansDialog, NewVisitDialog } from './visit-dialogs';
import { fetchSiteProgress, type SiteProgress } from './progress';

export function SiteDetail({ siteId }: { siteId: string }) {
  const t = useTranslations('siteDetail');
  const locale = useLocale() as AppLocale;
  const can = useCan();
  const site = useQuery({ queryKey: ['site', siteId], queryFn: () => getSite(siteId), staleTime: 60_000 });
  const progress = useQuery({ queryKey: ['site-progress', siteId], queryFn: () => fetchSiteProgress(siteId), staleTime: 30_000 });

  if (site.error) return <ErrorState error={site.error} onRetry={() => void site.refetch()} />;
  const s = site.data;
  return (
    <>
      <PageHeader
        title={s ? s.name : t('loading')}
        description={s ? [s.project?.name, s.exchange, s.room].filter(Boolean).join(' · ') : undefined}
        actions={
          can('review', 'Photo') ? (
            <Button asChild variant="outline">
              <Link href={`/review?siteId=${siteId}`}>
                <ListChecks aria-hidden />
                {t('reviewSite')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('readiness')}</CardTitle>
          </CardHeader>
          <CardContent>
            {progress.data ? (
              <>
                <p className="text-2xl font-semibold tabular-nums" data-testid="site-approved-pct">
                  {formatPercent(progress.data.total ? progress.data.approved / progress.data.total : 0, locale, 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('approvedOf', { approved: formatNumber(progress.data.approved, locale), total: formatNumber(progress.data.total, locale) })}
                </p>
              </>
            ) : (
              <Skeleton className="h-10" />
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Cpu className="size-4" aria-hidden />
              {t('devices')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s ? (
              s.devices?.length ? (
                <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {s.devices.map((d) => (
                    <li key={d.id}>
                      <span className="ltr-token font-medium">{d.hostname ?? d.model}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        — <span className="ltr-token">{d.model}</span>
                        {d.loopbackIp ? <> · <span className="ltr-token">{d.loopbackIp}</span></> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noDevices')}</p>
              )
            ) : (
              <Skeleton className="h-10" />
            )}
            {s?.gpsLat != null && s.gpsLng != null ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden />
                <span className="ltr-token">{s.gpsLat.toFixed(5)}, {s.gpsLng.toFixed(5)}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">{t('tabs.progress')}</TabsTrigger>
          <TabsTrigger value="photos">{t('tabs.photos')}</TabsTrigger>
          <TabsTrigger value="snags">{t('tabs.snags')}</TabsTrigger>
          <TabsTrigger value="visits">{t('tabs.visits')}</TabsTrigger>
        </TabsList>
        <TabsContent value="progress">
          <ProgressTable siteId={siteId} data={progress.data} loading={progress.isLoading} error={progress.error} onRetry={() => void progress.refetch()} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotoGrid siteId={siteId} />
        </TabsContent>
        <TabsContent value="snags">
          <SnagTracker fixedSiteId={siteId} showSiteFilters={false} />
        </TabsContent>
        <TabsContent value="visits">
          <VisitsTable siteId={siteId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProgressTable({ siteId, data, loading, error, onRetry }: { siteId: string; data?: SiteProgress; loading: boolean; error: unknown; onRetry: () => void }) {
  const t = useTranslations('siteDetail.progress');
  const locale = useLocale() as AppLocale;
  const can = useCan();
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !data) return <Skeleton className="h-64" />;
  if (data.rows.length === 0) return <EmptyState title={t('empty')} description={t('emptyHint')} />;
  return (
    <div className="rounded-lg border bg-card">
      <ul aria-label={t('title')} className="divide-y">
        <li className="hidden grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-4 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span>{t('category')}</span>
          <span>{t('bar')}</span>
          <span className="flex gap-4 text-end">
            <span className="w-14">{t('approved')}</span>
            <span className="w-14">{t('pending')}</span>
            <span className="w-14">{t('rejected')}</span>
          </span>
        </li>
        {data.rows.map((r) => (
          <li key={r.category} className="grid items-center gap-x-4 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,14rem)_1fr_auto]">
            <span className="truncate font-medium">{categoryTitle(r.category, locale)}</span>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={t('barLabel', { approved: r.approved, pending: r.pending, rejected: r.rejected })}
            >
              <span className="bg-st-success-fg" style={{ width: `${(r.approved / r.total) * 100}%` }} />
              <span className="bg-[var(--chart-2)]" style={{ width: `${(r.pending / r.total) * 100}%` }} />
              <span className="bg-[var(--chart-4)]" style={{ width: `${(r.rejected / r.total) * 100}%` }} />
            </div>
            <span className="flex gap-4 text-end tabular-nums">
              <span className="w-14 text-st-success-fg">{formatNumber(r.approved, locale)}</span>
              <span className={cn('w-14', r.pending ? 'text-st-warning-fg' : 'text-muted-foreground')}>{formatNumber(r.pending, locale)}</span>
              <span className={cn('w-14', r.rejected ? 'text-st-danger-fg' : 'text-muted-foreground')}>{formatNumber(r.rejected, locale)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-sm">
        <span className="flex gap-4 text-xs text-muted-foreground">
          <Legend color="bg-st-success-fg" label={t('approved')} />
          <Legend color="bg-[var(--chart-2)]" label={t('pending')} />
          <Legend color="bg-[var(--chart-4)]" label={t('rejected')} />
        </span>
        {can('review', 'Photo') && data.pending > 0 ? (
          <Button asChild variant="link" size="sm">
            <Link href={`/review?siteId=${siteId}`}>
              {t('reviewPending', { n: data.pending })}
              <ArrowRight className="rtl:-scale-x-100" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', color)} aria-hidden />
      {label}
    </span>
  );
}

function PhotoGrid({ siteId }: { siteId: string }) {
  const t = useTranslations('siteDetail.photos');
  const tStatus = useTranslations('status.photo');
  const locale = useLocale() as AppLocale;
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<PhotoCategoryDto | undefined>();
  const [status, setStatus] = useState<PhotoStatusDto | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const pageSize = 24;
  const q = useQuery({
    queryKey: ['photos', 'site', siteId, page, category, status],
    queryFn: () => listPhotos({ siteId, page, pageSize, category, status }),
    placeholderData: keepPreviousData,
  });
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / pageSize));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <FilterSelect label={t('category')} value={category ?? ALL} onChange={(v) => { setCategory(pickValue(v) as PhotoCategoryDto | undefined); setPage(1); }}>
          <SelectItem value={ALL}>{t('all')}</SelectItem>
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {categoryTitle(c, locale)}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect label={t('status')} value={status ?? ALL} onChange={(v) => { setStatus(pickValue(v) as PhotoStatusDto | undefined); setPage(1); }}>
          <SelectItem value={ALL}>{t('all')}</SelectItem>
          {PhotoStatus.options.map((s) => (
            <SelectItem key={s} value={s}>
              {tStatus(s)}
            </SelectItem>
          ))}
        </FilterSelect>
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {q.data?.items.map((p: PhotoDto) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p.id)} className="group block w-full overflow-hidden rounded-lg border bg-card text-start transition-shadow hover:shadow-md">
                <div className="aspect-[4/3] bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.urls.thumb} alt={categoryTitle(p.category, locale)} loading="lazy" className="size-full object-cover" />
                </div>
                <div className="flex flex-col gap-1 p-2">
                  <span className="truncate text-xs font-medium">{categoryTitle(p.category, locale)}</span>
                  <PhotoStatusBadge status={p.status} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('previous')}
          </Button>
          <span className="tabular-nums">{t('pageOf', { page, pages })}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            {t('next')}
          </Button>
        </div>
      ) : null}
      <PhotoDialog photoId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function VisitsTable({ siteId }: { siteId: string }) {
  const t = useTranslations('siteDetail.visits');
  const locale = useLocale() as AppLocale;
  const can = useCan();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<VisitDto | null>(null);
  const q = useQuery({ queryKey: ['visits', siteId, page], queryFn: () => listVisits({ siteId, page, pageSize: 10 }), placeholderData: keepPreviousData });
  const canAssign = can('assign', 'Visit');
  const columns: Column<VisitDto>[] = [
    { id: 'title', header: t('title'), cell: (v) => <span className="font-medium">{v.title}</span> },
    { id: 'type', header: t('type'), cell: (v) => t(`types.${v.type}`) },
    { id: 'status', header: t('status'), cell: (v) => <VisitStatusBadge status={v.status} /> },
    {
      id: 'tech',
      header: t('technicians'),
      cell: (v) => (
        <span className="flex items-center gap-2">
          <span>{v.assignments?.map((a) => a.user.name).join(', ') || '—'}</span>
          {canAssign && v.status !== 'closed' && v.status !== 'cancelled' ? (
            <Button variant="outline" size="sm" onClick={() => setAssigning(v)} aria-label={`${t('manage')}: ${v.title}`}>
              <Users aria-hidden />
              {t('manage')}
            </Button>
          ) : null}
        </span>
      ),
    },
    { id: 'photos', header: t('photos'), cell: (v) => formatNumber(v._count?.photos ?? 0, locale) },
    { id: 'when', header: t('when'), cell: (v) => formatDateTime(v.startedAt ?? v.scheduledFor ?? v.createdAt, locale) },
  ];
  return (
    <>
      <NewVisitDialog siteId={siteId} open={creating} onClose={() => setCreating(false)} />
      <AssignTechniciansDialog siteId={siteId} visit={assigning} onClose={() => setAssigning(null)} />
      <DataTable
        toolbar={
          can('create', 'Visit') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              {t('new')}
            </Button>
          ) : undefined
        }
        columns={columns}
        rows={q.data?.items}
        rowKey={(v) => v.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        page={page}
        pageSize={10}
        total={q.data?.total ?? 0}
        onPageChange={setPage}
        emptyTitle={t('empty')}
        caption={t('title')}
      />
    </>
  );
}

