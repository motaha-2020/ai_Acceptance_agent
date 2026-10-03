import { useCallback, useEffect, useState } from 'react';
import { CHECKLISTS } from '@acceptance/checklist';
import { useApp } from '../../app-context';
import { useAsync } from '../../lib/use-async';
import { PENDING_STATUSES } from '../../ui/status';
import { visitsApi } from './api';
import { buildShotPlan } from './shot-plan';

/** Everything the visit screens need: server visit/photos/snags + photos still in the local queue. */
export function useVisitData(visitId: string) {
  const { services, queue } = useApp();
  const [pollMs, setPollMs] = useState<number>();
  const load = useCallback(async () => {
    const [visit, photos, snags, local] = await Promise.all([
      visitsApi.get(services.api, visitId),
      visitsApi.photos(services.api, visitId),
      visitsApi.snags(services.api, visitId),
      services.store.list({ visitId, userId: services.session.user?.id }),
    ]);
    return { visit, photos: photos.items, snags: snags.items, local };
  }, [services, visitId]);
  // Reload when the local queue changes (an upload finished); poll while AI/review results are pending.
  const state = useAsync(load, [load, queue.counts.done, queue.counts.failed], pollMs);
  const data = state.data;
  useEffect(() => {
    const pending = data?.photos.some((p) => PENDING_STATUSES.includes(p.status)) ?? false;
    setPollMs(pending ? 15_000 : undefined);
  }, [data]);
  const plan = data
    ? buildShotPlan(
        CHECKLISTS,
        data.photos.map((p) => ({ id: p.id, clientUuid: p.clientUuid, category: p.category, status: p.status })),
        data.local.map((l) => ({ clientUuid: l.clientUuid, category: l.category, status: l.status })),
      )
    : [];
  return { ...state, plan };
}
