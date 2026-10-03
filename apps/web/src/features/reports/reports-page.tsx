'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/data/states';
import { DataTable, type Column } from '@/components/data/data-table';
import { listPhotos, listSites, listSnags } from '@/lib/api/endpoints';
import type { SiteDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import { GenerateReport, LatestReport } from './report-actions';
import { reportStrings } from './report-strings';

export type Readiness = 'ready' | 'blocked' | 'inProgress';

/** Report gate (ADR: only approved photos enter a report; blocked while open snags exist). */
export function readinessOf(input: { approved: number; pending: number; openSnags: number }): Readiness {
  if (input.openSnags > 0) return 'blocked';
  if (input.pending > 0 || input.approved === 0) return 'inProgress';
  return 'ready';
}

const TONE: Record<Readiness, BadgeTone> = { ready: 'success', blocked: 'danger', inProgress: 'warning' };
const PAGE_SIZE = 10;

export function ReportsPage() {
  const t = useTranslations('reports');
  const locale = useLocale() as AppLocale;
  const s = reportStrings(locale);
  const [page, setPage] = useState(1);
  const sites = useQuery({ queryKey: ['sites', 'reports', page], queryFn: () => listSites({ page, pageSize: PAGE_SIZE }), placeholderData: keepPreviousData });
  const items = sites.data?.items ?? [];

  const counts = useQueries({
    queries: items.flatMap((s) => [
      { queryKey: ['reports', 'approved', s.id], queryFn: () => listPhotos({ siteId: s.id, status: 'approved', pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ['reports', 'pending', s.id], queryFn: () => listPhotos({ siteId: s.id, status: 'pending_review', pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ['reports', 'open-snags', s.id], queryFn: () => listSnags({ siteId: s.id, status: 'open', pageSize: 1 }), staleTime: 30_000 },
    ]),
  });
  const rowData = (i: number): { approved: number | null; pending: number | null; openSnags: number | null } => ({
    approved: counts[i * 3]?.data?.total ?? null,
    pending: counts[i * 3 + 1]?.data?.total ?? null,
    openSnags: counts[i * 3 + 2]?.data?.total ?? null,
  });

  const columns: Column<SiteDto>[] = [
    { id: 'site', header: t('col.site'), cell: (s) => (<div><Link href={`/sites/${s.id}`} className="font-medium hover:underline">{s.name}</Link><div className="ltr-token font-mono text-[0.6875rem] text-muted-foreground">{s.code}</div></div>) },
    { id: 'approved', header: t('col.approved'), cell: (s) => <Num v={rowData(items.indexOf(s)).approved} locale={locale} /> },
    { id: 'pending', header: t('col.pending'), cell: (s) => <Num v={rowData(items.indexOf(s)).pending} locale={locale} /> },
    { id: 'open', header: t('col.openSnags'), cell: (s) => <Num v={rowData(items.indexOf(s)).openSnags} locale={locale} danger /> },
    {
      id: 'readiness',
      header: t('col.readiness'),
      cell: (s) => {
        const d = rowData(items.indexOf(s));
        if (d.approved === null || d.pending === null || d.openSnags === null) return <Skeleton className="h-5 w-20" />;
        const r = readinessOf({ approved: d.approved, pending: d.pending, openSnags: d.openSnags });
        return (
          <div className="flex flex-col gap-0.5">
            <Badge tone={TONE[r]}>{t(`readiness.${r}`)}</Badge>
            {r === 'blocked' ? <span className="text-xs text-muted-foreground">{t('blockedHint', { n: d.openSnags })}</span> : null}
          </div>
        );
      },
    },
    { id: 'latest', header: s.colLatest, cell: (site) => <LatestReport siteId={site.id} s={s} /> },
    {
      id: 'generate',
      header: <span className="sr-only">{t('generate')}</span>,
      cell: (site) => {
        const d = rowData(items.indexOf(site));
        const ready = d.approved !== null && d.pending !== null && d.openSnags !== null && readinessOf({ approved: d.approved, pending: d.pending, openSnags: d.openSnags }) === 'ready';
        return <GenerateReport siteId={site.id} canFinal={ready} s={s} />;
      },
    },
  ];

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Alert tone="info" className="mb-4">
        <Info aria-hidden />
        <p>{s.intro}</p>
      </Alert>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(s) => s.id}
        isLoading={sites.isLoading}
        error={sites.error}
        onRetry={() => void sites.refetch()}
        page={page}
        pageSize={PAGE_SIZE}
        total={sites.data?.total ?? 0}
        onPageChange={setPage}
        emptyTitle={t('empty')}
        caption={t('title')}
      />
    </>
  );
}

function Num({ v, locale, danger }: { v: number | null; locale: AppLocale; danger?: boolean }) {
  if (v === null) return <Skeleton className="h-4 w-8" />;
  return <span className={danger && v > 0 ? 'font-semibold tabular-nums text-st-danger-fg' : 'tabular-nums'}>{formatNumber(v, locale)}</span>;
}
