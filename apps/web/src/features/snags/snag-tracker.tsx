'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, Eye, RotateCcw } from 'lucide-react';
import { SnagSource, SnagStatus } from '@acceptance/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { ALL, FilterSelect, pickValue as pick } from '@/components/data/filter-select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/data/data-table';
import { SeverityBadge, SnagStatusBadge } from '@/components/data/status-badges';
import { useCan } from '@/components/session-provider';
import { useProjects, useSiteMap, useSites } from '@/features/common/lookups';
import { PhotoDialog } from '@/features/sites/photo-dialog';
import { listSnags, reopenSnag, verifySnag } from '@/lib/api/endpoints';
import type { PhotoCategoryDto, SnagListItem, SnagSourceDto, SnagStatusDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { useErrorMessage } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { CATEGORIES, categoryTitle, snagTitles } from '@/lib/taxonomy';

/** Snag tracker: open -> fixed (re-shot by the technician) -> verified (by a reviewer/PM). */
export function SnagTracker({ fixedSiteId, showSiteFilters = true }: { fixedSiteId?: string; showSiteFilters?: boolean }) {
  const t = useTranslations('snagTracker');
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;
  const can = useCan();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const siteMap = useSiteMap();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [siteId, setSiteId] = useState<string | undefined>(fixedSiteId);
  const [category, setCategory] = useState<PhotoCategoryDto | undefined>();
  const [status, setStatus] = useState<SnagStatusDto | undefined>('open');
  const [source, setSource] = useState<SnagSourceDto | undefined>();
  const [code, setCode] = useState('');
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [reopening, setReopening] = useState<SnagListItem | null>(null);
  const [reason, setReason] = useState('');

  const projects = useProjects();
  const sites = useSites(projectId);
  const effectiveSite = fixedSiteId ?? siteId;
  const query = { page, pageSize, projectId, siteId: effectiveSite, category, status, source, code: code || undefined };
  const snags = useQuery({ queryKey: ['snags', query], queryFn: () => listSnags(query), placeholderData: keepPreviousData });

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ['snags'] });
    void qc.invalidateQueries({ queryKey: ['site-progress'] });
  };
  const verify = useMutation({
    mutationFn: (s: SnagListItem) => verifySnag(s.id),
    onSuccess: () => {
      toast.success(t('verified'));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reopen = useMutation({
    mutationFn: ({ s, why }: { s: SnagListItem; why: string }) => reopenSnag(s.id, why),
    onSuccess: () => {
      toast.success(t('reopened'));
      setReopening(null);
      setReason('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reset = (fn: () => void): void => {
    fn();
    setPage(1);
  };

  const columns: Column<SnagListItem>[] = useMemo(
    () => [
      {
        id: 'snag',
        header: t('col.snag'),
        sortValue: (s) => snagTitles(s.code, locale, s).primary,
        cell: (s) => {
          const titles = snagTitles(s.code, locale, s);
          return (
            <div className="max-w-xs">
              <p className="font-medium leading-snug">{titles.primary}</p>
              <p className="text-xs text-muted-foreground" lang={locale === 'ar' ? 'en' : 'ar'}>
                {titles.secondary}
              </p>
              <p className="ltr-token font-mono text-[0.6875rem] text-muted-foreground">{s.code}</p>
            </div>
          );
        },
      },
      { id: 'severity', header: t('col.severity'), sortValue: (s) => ['minor', 'major', 'critical'].indexOf(s.severity), cell: (s) => <SeverityBadge severity={s.severity} /> },
      { id: 'status', header: t('col.status'), sortValue: (s) => s.status, cell: (s) => <SnagStatusBadge status={s.status} /> },
      { id: 'category', header: t('col.category'), sortValue: (s) => categoryTitle(s.photo.category, locale), cell: (s) => categoryTitle(s.photo.category, locale) },
      {
        id: 'site',
        header: t('col.site'),
        cell: (s) => {
          const site = siteMap.get(s.photo.siteId);
          return site ? <span><span className="ltr-token">{site.code}</span> · {site.name}</span> : '—';
        },
      },
      { id: 'source', header: t('col.source'), cell: (s) => <Badge tone={s.source === 'ai' ? 'info' : 'violet'}>{t(`source.${s.source}`)}</Badge> },
      { id: 'age', header: t('col.created'), sortValue: (s) => s.createdAt, cell: (s) => <span className="text-muted-foreground">{formatRelative(s.createdAt, locale)}</span> },
      {
        id: 'actions',
        header: <span className="sr-only">{tCommon('actions')}</span>,
        cell: (s) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setPhotoId(s.photoId)}>
              <Eye aria-hidden />
              {t('viewPhoto')}
            </Button>
            {s.status === 'fixed' && can('verify', 'Snag') ? (
              <>
                <Button variant="outline" size="sm" onClick={() => verify.mutate(s)} loading={verify.isPending && verify.variables?.id === s.id}>
                  <CheckCheck aria-hidden />
                  {t('verify')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setReopening(s)}>
                  <RotateCcw aria-hidden />
                  {t('reopen')}
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [t, tCommon, locale, siteMap, can, verify],
  );

  const toolbar = (
    <>
      {showSiteFilters && !fixedSiteId ? (
        <>
          <FilterSelect label={t('filters.project')} value={projectId ?? ALL} onChange={(v) => reset(() => { setProjectId(pick(v)); setSiteId(undefined); })}>
            <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
            {projects.data?.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </FilterSelect>
          <FilterSelect label={t('filters.site')} value={siteId ?? ALL} onChange={(v) => reset(() => setSiteId(pick(v)))}>
            <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
            {sites.data?.items.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </FilterSelect>
        </>
      ) : null}
      <FilterSelect label={t('filters.category')} value={category ?? ALL} onChange={(v) => reset(() => setCategory(pick(v) as PhotoCategoryDto | undefined))}>
        <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryTitle(c, locale)}</SelectItem>)}
      </FilterSelect>
      <FilterSelect label={t('filters.status')} value={status ?? ALL} onChange={(v) => reset(() => setStatus(pick(v) as SnagStatusDto | undefined))}>
        <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
        {SnagStatus.options.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
      </FilterSelect>
      <FilterSelect label={t('filters.source')} value={source ?? ALL} onChange={(v) => reset(() => setSource(pick(v) as SnagSourceDto | undefined))}>
        <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
        {SnagSource.options.map((s) => <SelectItem key={s} value={s}>{t(`source.${s}`)}</SelectItem>)}
      </FilterSelect>
      <div className="flex min-w-40 flex-col gap-1">
        <Label htmlFor="snag-code" className="text-xs font-normal text-muted-foreground">{t('filters.code')}</Label>
        <Input id="snag-code" dir="ltr" className="h-8 text-start" placeholder="LABEL_MISSING" value={code} onChange={(e) => reset(() => setCode(e.target.value.toUpperCase().trim()))} />
      </div>
    </>
  );

  return (
    <>
      <DataTable
        columns={columns}
        rows={snags.data?.items}
        rowKey={(s) => s.id}
        isLoading={snags.isLoading}
        error={snags.error}
        onRetry={() => void snags.refetch()}
        page={page}
        pageSize={pageSize}
        total={snags.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(n) => reset(() => setPageSize(n))}
        emptyTitle={t('empty')}
        emptyDescription={t('emptyHint')}
        caption={t('title')}
        toolbar={toolbar}
      />
      <PhotoDialog photoId={photoId} onClose={() => setPhotoId(null)} />
      <Dialog open={!!reopening} onOpenChange={(o) => !o && setReopening(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reopenTitle')}</DialogTitle>
            <DialogDescription>{t('reopenDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reopen-reason">{t('reason')}</Label>
            <Textarea id="reopen-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopening(null)}>{tCommon('cancel')}</Button>
            <Button disabled={!reason.trim()} loading={reopen.isPending} onClick={() => reopening && reopen.mutate({ s: reopening, why: reason.trim() })}>
              {t('reopen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

