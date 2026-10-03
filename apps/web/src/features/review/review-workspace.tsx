'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CircleHelp, Loader2, PartyPopper, Plus, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { PhotoStatusBadge } from '@/components/data/status-badges';
import { EmptyState, ErrorState } from '@/components/data/states';
import { useCan } from '@/components/session-provider';
import { ApiRequestError } from '@/lib/api/client';
import { approvePhoto, getReviewQueue, listUsers, rejectPhoto, submitReview } from '@/lib/api/endpoints';
import type { QueueItem, SnagDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { useErrorMessage } from '@/lib/errors';
import { categoryTitle, snagTitle, type SnagDefinition } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import { PhotoViewer, type PhotoViewerHandle, type ViewerBox } from './photo-viewer';
import { EMPTY_EDITS, hasEdits, planAgree, planDecision, planErrorKeyOf, remainingSnags, type FinalVerdict, type ReviewPlan, type StagedEdits } from './plan';
import { ChecklistSection, MetadataSection, SnagList, VerdictCard } from './review-panel';
import { DecisionDialog, RemoveSnagDialog, ShortcutsDialog } from './reason-dialogs';
import { ReviewFiltersBar, type ReviewFilters } from './review-filters';
import { SnagPicker } from './snag-picker';
import { useHotkeys } from './use-hotkeys';

const PAGE_SIZE = 50;
const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function defaultVerdict(item: QueueItem, edits: StagedEdits): FinalVerdict {
  if (edits.added.length > 0) return 'reject';
  if (edits.removed.length > 0 && edits.removed.length >= item.snags.length) return 'accept';
  return item.analysis?.verdict === 'reject' ? 'accept' : 'reject';
}

export function ReviewWorkspace({ filters, onFiltersChange }: { filters: ReviewFilters; onFiltersChange: (f: ReviewFilters) => void }) {
  const t = useTranslations('review');
  const tErr = useTranslations('review.planError');
  const locale = useLocale() as AppLocale;
  const qc = useQueryClient();
  const can = useCan();
  const errorMessage = useErrorMessage();
  const viewer = useRef<PhotoViewerHandle>(null);

  const queue = useQuery({
    queryKey: ['review-queue', filters],
    queryFn: () => getReviewQueue({ ...filters, page: 1, pageSize: PAGE_SIZE }),
    refetchInterval: 10 * 60_000, // also refreshes the signed photo URLs (15 min TTL)
  });
  const users = useQuery({ queryKey: ['users', 'lookup'], queryFn: () => listUsers({ pageSize: 200 }), staleTime: 5 * 60_000 });
  const userName = useMemo(() => new Map((users.data?.items ?? []).map((u) => [u.id, u.name])), [users.data]);

  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, StagedEdits>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [selectedSnag, setSelectedSnag] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [decision, setDecision] = useState<FinalVerdict | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SnagDto | null>(null);
  const [drawingFor, setDrawingFor] = useState<string | null>(null);
  const [inflight, setInflight] = useState(0);
  const [announce, setAnnounce] = useState('');
  const reviewedRef = useRef(new Set<string>());

  const items = useMemo(() => (queue.data?.items ?? []).filter((i) => !hidden.has(i.id)), [queue.data, hidden]);
  const found = items.findIndex((i) => i.id === currentId);
  const idx = found >= 0 ? found : 0;
  const item: QueueItem | undefined = items[idx];
  const itemEdits = (item && edits[item.id]) || EMPTY_EDITS;

  useEffect(() => {
    if (item && item.id !== currentId) setCurrentId(item.id);
  }, [item, currentId]);

  // Forget local state of photos the server no longer lists (decided, possibly by someone else).
  useEffect(() => {
    if (!queue.data) return;
    const present = new Set(queue.data.items.map((i) => i.id));
    setHidden((h) => {
      const next = new Set([...h].filter((id) => present.has(id)));
      return next.size === h.size ? h : next;
    });
  }, [queue.data]);

  // Warm the cache for the next photos so auto-advance is instant.
  useEffect(() => {
    for (const n of items.slice(idx + 1, idx + 3)) {
      const img = new Image();
      img.src = n.urls.web;
    }
  }, [items, idx]);

  useEffect(() => {
    setSelectedSnag(null);
    setDrawingFor(null);
  }, [item?.id]);

  const editsFor = useCallback((id: string, fn: (e: StagedEdits) => StagedEdits) => {
    setEdits((all) => ({ ...all, [id]: fn(all[id] ?? EMPTY_EDITS) }));
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (items.length < 2) return;
      const target = items[(idx + delta + items.length) % items.length];
      if (target) setCurrentId(target.id);
    },
    [items, idx],
  );

  const submit = useCallback(
    (target: QueueItem, plan: ReviewPlan) => {
      const upNext = items[idx + 1] ?? items[idx - 1];
      setHidden((h) => new Set(h).add(target.id));
      setCurrentId(upNext && upNext.id !== target.id ? upNext.id : null);
      setInflight((n) => n + 1);
      setDecision(null);
      void (async () => {
        try {
          if (!reviewedRef.current.has(target.id)) {
            await submitReview(target.id, plan.review);
            reviewedRef.current.add(target.id);
          }
          if (plan.finalize.kind === 'approve') await approvePhoto(target.id);
          else await rejectPhoto(target.id, plan.finalize.reason);
          reviewedRef.current.delete(target.id);
          setEdits((all) => {
            const { [target.id]: _dropped, ...rest } = all;
            return rest;
          });
          setAnnounce(t('saved', { verdict: t(`verdictWord.${plan.verdict}`) }));
          void qc.invalidateQueries({ queryKey: ['snags'] });
          void qc.invalidateQueries({ queryKey: ['metrics'] });
          void qc.invalidateQueries({ queryKey: ['site-progress'] });
        } catch (err) {
          const code = err instanceof ApiRequestError ? err.code : '';
          if (code === 'NOT_REVIEWABLE' || code === 'CONCURRENT_UPDATE') {
            toast.info(t('alreadyDecided'));
            return;
          }
          // Safe failure: put the photo back, keep the staged edits, and say exactly what happened.
          setHidden((h) => {
            const next = new Set(h);
            next.delete(target.id);
            return next;
          });
          setCurrentId(target.id);
          toast.error(t('submitFailed'), { description: errorMessage(err), duration: 8000 });
        } finally {
          setInflight((n) => n - 1);
        }
      })();
    },
    [items, idx, qc, t, errorMessage],
  );

  // Do not lose decisions that are still being saved if the tab is closed.
  useEffect(() => {
    if (inflight === 0) return;
    const warn = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inflight]);

  // When nothing is in flight, re-sync with the server (also tops the list up after a batch).
  const wasInflight = useRef(0);
  useEffect(() => {
    if (wasInflight.current > 0 && inflight === 0) void qc.invalidateQueries({ queryKey: ['review-queue'] });
    wasInflight.current = inflight;
  }, [inflight, qc]);

  const agree = useCallback(() => {
    if (!item) return;
    const res = planAgree(item, itemEdits);
    if (!res.ok) {
      toast.warning(tErr(planErrorKeyOf(res.error)));
      return;
    }
    submit(item, res.plan);
  }, [item, itemEdits, submit, tErr]);

  const openDecision = useCallback(
    (verdict?: FinalVerdict) => {
      if (!item) return;
      setDecision(verdict ?? defaultVerdict(item, itemEdits));
    },
    [item, itemEdits],
  );

  const onPick = useCallback(
    (def: SnagDefinition) => {
      if (!item) return;
      const tempId = uid();
      editsFor(item.id, (e) => ({ ...e, added: [...e.added, { tempId, code: def.code, severity: def.defaultSeverity }] }));
      setDrawingFor(tempId);
    },
    [item, editsFor],
  );

  const removeAt = useCallback(
    (n: number) => {
      const s = item?.snags[n];
      if (s) setSelectedSnag((cur) => (cur === s.id ? null : s.id));
    },
    [item],
  );

  const dialogOpen = pickerOpen || decision !== null || helpOpen || removeTarget !== null;
  const allowed = can('review', 'Photo');

  useHotkeys(
    {
      KeyA: agree,
      KeyR: () => openDecision(),
      KeyS: () => item && setPickerOpen(true),
      KeyN: () => go(1),
      ArrowRight: () => go(1),
      KeyP: () => go(-1),
      ArrowLeft: () => go(-1),
      KeyB: () => setShowBoxes((v) => !v),
      Equal: () => viewer.current?.zoomIn(),
      'Shift+Equal': () => viewer.current?.zoomIn(),
      NumpadAdd: () => viewer.current?.zoomIn(),
      Minus: () => viewer.current?.zoomOut(),
      NumpadSubtract: () => viewer.current?.zoomOut(),
      Digit0: () => viewer.current?.reset(),
      Numpad0: () => viewer.current?.reset(),
      Digit1: () => removeAt(0),
      Digit2: () => removeAt(1),
      Digit3: () => removeAt(2),
      Digit4: () => removeAt(3),
      Digit5: () => removeAt(4),
      Digit6: () => removeAt(5),
      Digit7: () => removeAt(6),
      Digit8: () => removeAt(7),
      Digit9: () => removeAt(8),
      KeyX: () => {
        const s = item?.snags.find((x) => x.id === selectedSnag);
        if (s && !itemEdits.removed.some((r) => r.snagId === s.id)) setRemoveTarget(s);
      },
      Enter: () => hasEdits(itemEdits) && openDecision(),
      Escape: () => setDrawingFor(null),
      'Shift+Slash': () => setHelpOpen(true),
    },
    allowed && !dialogOpen,
  );

  const boxes: ViewerBox[] = useMemo(() => {
    if (!item) return [];
    const removed = new Set(itemEdits.removed.map((r) => r.snagId));
    const out: ViewerBox[] = [];
    item.snags.forEach((s, i) => {
      if (!s.bbox) return;
      out.push({ id: s.id, bbox: s.bbox, tone: removed.has(s.id) ? 'removed' : s.source === 'human' ? 'human' : s.severity, label: `${i + 1} · ${snagTitle(s.code, locale, s)}`, selected: selectedSnag === s.id });
    });
    for (const a of itemEdits.added) {
      if (a.bbox) out.push({ id: a.tempId, bbox: a.bbox, tone: 'human', label: `+ ${snagTitle(a.code, locale)}`, selected: drawingFor === a.tempId });
    }
    return out;
  }, [item, itemEdits, selectedSnag, drawingFor, locale]);

  const activeCodes = useMemo(() => {
    if (!item) return new Set<string>();
    return new Set([...remainingSnags(item, itemEdits).map((s) => s.code), ...itemEdits.added.map((a) => a.code)]);
  }, [item, itemEdits]);

  if (!allowed) {
    return <Alert tone="warning">{t('notAllowed')}</Alert>;
  }

  const total = queue.data?.total ?? 0;
  const remaining = Math.max(items.length, total - hidden.size);

  const agreeBlockReason = item ? (() => {
    const r = planAgree(item, itemEdits);
    return r.ok ? null : tErr(planErrorKeyOf(r.error));
  })() : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ReviewFiltersBar value={filters} onChange={onFiltersChange} />
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="queue-count" className="rounded-md bg-muted px-2.5 py-1 tabular-nums">
            {t('remaining', { n: remaining })}
          </span>
          {inflight > 0 ? (
            <span className="flex items-center gap-1.5 text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('saving', { n: inflight })}
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <CircleHelp aria-hidden />
            {t('shortcuts.button')}
            <Kbd>?</Kbd>
          </Button>
        </div>
      </div>

      <div className="sr-only" aria-live="polite" data-testid="announcer">
        {announce}
      </div>

      {queue.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Skeleton className="h-[60vh]" />
          <Skeleton className="h-[60vh]" />
        </div>
      ) : queue.error ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : !item ? (
        <EmptyState
          icon={<PartyPopper className="size-9" aria-hidden />}
          title={inflight > 0 ? t('savingTitle') : t('emptyTitle')}
          description={inflight > 0 ? t('savingDescription') : t('emptyDescription')}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:h-[calc(100dvh-10.5rem)] lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <PhotoViewer
              ref={viewer}
              className="h-[55vh] lg:h-auto lg:flex-1"
              src={item.urls.web}
              alt={t('photoAlt', { category: categoryTitle(item.category, locale), site: item.site.name })}
              width={item.width}
              height={item.height}
              boxes={boxes}
              showBoxes={showBoxes}
              onToggleBoxes={() => setShowBoxes((v) => !v)}
              drawing={drawingFor !== null}
              onDraw={(bbox) => {
                const target = drawingFor;
                if (!target) return;
                editsFor(item.id, (e) => ({ ...e, added: e.added.map((a) => (a.tempId === target ? { ...a, bbox } : a)) }));
                setDrawingFor(null);
              }}
              onImageError={() => void qc.invalidateQueries({ queryKey: ['review-queue'] })}
            />
            <Filmstrip items={items} activeIndex={idx} onSelect={(id) => setCurrentId(id)} />
          </div>

          <aside className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card" aria-label={t("panel")} data-photo-id={item.id}>
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-semibold" data-testid="current-category">
                  {categoryTitle(item.category, locale)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="ltr-token">{item.site.code}</span> · {t('position', { n: idx + 1, total: items.length })}
                </p>
              </div>
              <PhotoStatusBadge status={item.status} />
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              <VerdictCard item={item} />
              <SnagList
                item={item}
                edits={itemEdits}
                selectedId={selectedSnag}
                onSelect={setSelectedSnag}
                onRemove={setRemoveTarget}
                onUndoRemove={(snagId) => editsFor(item.id, (e) => ({ ...e, removed: e.removed.filter((r) => r.snagId !== snagId) }))}
                onRemoveStaged={(tempId) => editsFor(item.id, (e) => ({ ...e, added: e.added.filter((a) => a.tempId !== tempId) }))}
                onMarkBox={(tempId) => setDrawingFor(tempId)}
              />
              <ChecklistSection item={item} activeCodes={activeCodes} />
              <MetadataSection item={item} technicianName={userName.get(item.uploadedById)} />
            </div>

            <div className="grid gap-2 border-t bg-card p-3">
              {hasEdits(itemEdits) ? (
                <Button size="lg" onClick={() => openDecision()} data-testid="submit-edits">
                  <Check aria-hidden />
                  {t('actions.submitEdits')}
                  <Kbd className="bg-primary-foreground/20 text-primary-foreground">Enter</Kbd>
                </Button>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="success" size="lg" className="col-span-2" onClick={agree} disabled={agreeBlockReason !== null} title={agreeBlockReason ?? undefined} data-testid="agree">
                  <Check aria-hidden />
                  {t('actions.agree')}
                  <Kbd className="bg-black/20 text-inherit">A</Kbd>
                </Button>
                <Button variant="outline" className="border-st-danger-fg/40 text-st-danger-fg hover:bg-st-danger-bg" onClick={() => openDecision()} data-testid="reject">
                  <X aria-hidden />
                  {t('actions.reject')}
                  <Kbd>R</Kbd>
                </Button>
                <Button variant="outline" onClick={() => setPickerOpen(true)} data-testid="add-snag">
                  <Plus aria-hidden />
                  {t('actions.addSnag')}
                  <Kbd>S</Kbd>
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => go(1)} disabled={items.length < 2}>
                <SkipForward className="rtl:-scale-x-100" aria-hidden />
                {t('actions.next')}
                <Kbd>N</Kbd>
              </Button>
              {agreeBlockReason && !hasEdits(itemEdits) ? <p className="text-xs text-muted-foreground">{agreeBlockReason}</p> : null}
            </div>
          </aside>
        </div>
      )}

      {item ? (
        <>
          <SnagPicker open={pickerOpen} onOpenChange={setPickerOpen} category={item.category} onPick={onPick} />
          <RemoveSnagDialog
            snag={removeTarget}
            onClose={() => setRemoveTarget(null)}
            onConfirm={(reason) => {
              const s = removeTarget;
              if (s) editsFor(item.id, (e) => ({ ...e, removed: [...e.removed.filter((r) => r.snagId !== s.id), { snagId: s.id, reason }] }));
              setRemoveTarget(null);
            }}
          />
          <DecisionDialog
            open={decision !== null}
            item={item}
            edits={itemEdits}
            initialVerdict={decision ?? 'reject'}
            onClose={() => setDecision(null)}
            onSubmit={(verdict, reason) => {
              const res = planDecision(item, itemEdits, verdict, reason);
              if (res.ok) submit(item, res.plan);
            }}
          />
        </>
      ) : null}
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function Filmstrip({ items, activeIndex, onSelect }: { items: QueueItem[]; activeIndex: number; onSelect: (id: string) => void }) {
  const t = useTranslations('review');
  const locale = useLocale() as AppLocale;
  const slice = items.slice(activeIndex, activeIndex + 8);
  if (slice.length < 2) return null;
  return (
    <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label={t('upNext')}>
      {slice.map((it, i) => (
        <li key={it.id} className="shrink-0">
          <button
            type="button"
            onClick={() => onSelect(it.id)}
            aria-current={i === 0 ? 'true' : undefined}
            aria-label={`${categoryTitle(it.category, locale)} — ${it.site.name}`}
            className={cn('relative block h-14 w-[4.5rem] overflow-hidden rounded-md border bg-muted', i === 0 && 'ring-2 ring-ring')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.urls.thumb} alt="" loading="lazy" className="size-full object-cover" />
            {it.analysis?.verdict === 'reject' ? <span className="absolute end-0.5 top-0.5 size-2 rounded-full bg-[var(--chart-4)]" aria-hidden /> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}
