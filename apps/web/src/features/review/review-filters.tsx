'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { SelectItem } from '@/components/ui/select';
import { ALL, FilterSelect, pickValue as pick } from '@/components/data/filter-select';
import { listProjects, listSites } from '@/lib/api/endpoints';
import type { PhotoCategoryDto, PhotoStatusDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { CATEGORIES, categoryTitle } from '@/lib/taxonomy';

export interface ReviewFilters {
  projectId?: string;
  siteId?: string;
  category?: PhotoCategoryDto;
  status: PhotoStatusDto;
}

const STATUSES: PhotoStatusDto[] = ['pending_review', 'fixed'];

export function ReviewFiltersBar({ value, onChange }: { value: ReviewFilters; onChange: (v: ReviewFilters) => void }) {
  const t = useTranslations('review.filters');
  const tStatus = useTranslations('status.photo');
  const locale = useLocale() as AppLocale;
  const projects = useQuery({ queryKey: ['projects', 'all'], queryFn: () => listProjects({ pageSize: 100 }), staleTime: 5 * 60_000 });
  const sites = useQuery({
    queryKey: ['sites', 'by-project', value.projectId ?? null],
    queryFn: () => listSites({ projectId: value.projectId, pageSize: 200 }),
    staleTime: 5 * 60_000,
  });
  const set = (patch: Partial<ReviewFilters>): void => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label={t('title')}>
      <FilterSelect label={t('project')} value={value.projectId ?? ALL} onChange={(v) => set({ projectId: pick(v), siteId: undefined })}>
        <SelectItem value={ALL}>{t('allProjects')}</SelectItem>
        {projects.data?.items.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect label={t('site')} value={value.siteId ?? ALL} onChange={(v) => set({ siteId: pick(v) })}>
        <SelectItem value={ALL}>{t('allSites')}</SelectItem>
        {sites.data?.items.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect label={t('category')} value={value.category ?? ALL} onChange={(v) => set({ category: pick(v) as PhotoCategoryDto | undefined })}>
        <SelectItem value={ALL}>{t('allCategories')}</SelectItem>
        {CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {categoryTitle(c, locale)}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect label={t('status')} value={value.status} onChange={(v) => set({ status: v as PhotoStatusDto })}>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {tStatus(s)}
          </SelectItem>
        ))}
      </FilterSelect>
    </div>
  );
}

