'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PhotoCategory, PhotoStatus } from '@acceptance/shared';
import { ReviewWorkspace } from './review-workspace';
import type { ReviewFilters } from './review-filters';

/** Filters live in the URL so a site page can deep-link into "review this site, this category". */
export function ReviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters: ReviewFilters = useMemo(() => {
    const category = PhotoCategory.safeParse(params.get('category'));
    const status = PhotoStatus.safeParse(params.get('status'));
    return {
      projectId: params.get('projectId') ?? undefined,
      siteId: params.get('siteId') ?? undefined,
      category: category.success ? category.data : undefined,
      status: status.success ? status.data : 'pending_review',
    };
  }, [params]);

  const onChange = useCallback(
    (next: ReviewFilters) => {
      const sp = new URLSearchParams();
      if (next.projectId) sp.set('projectId', next.projectId);
      if (next.siteId) sp.set('siteId', next.siteId);
      if (next.category) sp.set('category', next.category);
      if (next.status !== 'pending_review') sp.set('status', next.status);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return <ReviewWorkspace filters={filters} onFiltersChange={onChange} />;
}
