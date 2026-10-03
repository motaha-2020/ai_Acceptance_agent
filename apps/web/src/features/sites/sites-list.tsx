'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/data/data-table';
import { ALL, FilterSelect, pickValue } from '@/components/data/filter-select';
import { useProjects } from '@/features/common/lookups';
import { listSites } from '@/lib/api/endpoints';
import type { SiteDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';

export function SitesList() {
  const t = useTranslations('sites');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>();
  const projects = useProjects();
  const query = { page, pageSize, q: q || undefined, projectId };
  const sites = useQuery({ queryKey: ['sites', 'list', query], queryFn: () => listSites(query), placeholderData: keepPreviousData });

  const columns: Column<SiteDto>[] = useMemo(
    () => [
      { id: 'code', header: t('col.code'), sortValue: (s) => s.code, cell: (s) => <span className="ltr-token font-mono text-[0.8125rem]">{s.code}</span> },
      { id: 'name', header: t('col.name'), sortValue: (s) => s.name, cell: (s) => <span className="font-medium">{s.name}</span> },
      { id: 'project', header: t('col.project'), cell: (s) => s.project?.name ?? '—' },
      { id: 'exchange', header: t('col.exchange'), cell: (s) => s.exchange ?? '—' },
      {
        id: 'devices',
        header: t('col.devices'),
        cell: (s) =>
          s.devices?.length ? (
            <span className="ltr-token text-xs">{s.devices.map((d) => d.hostname ?? d.model).join(', ')}</span>
          ) : (
            '—'
          ),
      },
      { id: 'photos', header: t('col.photos'), sortValue: (s) => s._count?.photos ?? 0, cell: (s) => formatNumber(s._count?.photos ?? 0, locale) },
      { id: 'visits', header: t('col.visits'), sortValue: (s) => s._count?.visits ?? 0, cell: (s) => formatNumber(s._count?.visits ?? 0, locale) },
    ],
    [t, locale],
  );

  return (
    <DataTable
      columns={columns}
      rows={sites.data?.items}
      rowKey={(s) => s.id}
      isLoading={sites.isLoading}
      error={sites.error}
      onRetry={() => void sites.refetch()}
      page={page}
      pageSize={pageSize}
      total={sites.data?.total ?? 0}
      onPageChange={setPage}
      onPageSizeChange={(n) => {
        setPageSize(n);
        setPage(1);
      }}
      onRowClick={(s) => router.push(`/sites/${s.id}`)}
      rowLabel={(s) => s.name}
      emptyTitle={t('empty')}
      emptyDescription={t('emptyHint')}
      caption={t('title')}
      toolbar={
        <>
          <div className="relative flex min-w-56 flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t('search')}</span>
            <Search className="pointer-events-none absolute start-2.5 bottom-2 size-4 text-muted-foreground" aria-hidden />
            <Input aria-label={t('search')} className="h-8 ps-8" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('searchPlaceholder')} />
          </div>
          <FilterSelect label={t('col.project')} value={projectId ?? ALL} onChange={(v) => { setProjectId(pickValue(v)); setPage(1); }}>
            <SelectItem value={ALL}>{t('allProjects')}</SelectItem>
            {projects.data?.items.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </FilterSelect>
        </>
      }
    />
  );
}
