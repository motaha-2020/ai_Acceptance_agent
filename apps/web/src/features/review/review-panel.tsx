'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Bot, CheckCircle2, ChevronDown, Crosshair, MapPin, Trash2, Undo2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhotoStatusBadge, SeverityBadge, VerdictBadge } from '@/components/data/status-badges';
import { getPhoto, getSite } from '@/lib/api/endpoints';
import type { QueueItem, SnagDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { formatDateTime, formatNumber, formatPercent, formatGps, formatBytes } from '@/lib/format';
import { categoryChecklist, categoryTitle, snagDefinition, snagTitles } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import type { StagedEdits } from './plan';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </>
  );
}

export function VerdictCard({ item }: { item: QueueItem }) {
  const t = useTranslations('review.ai');
  const locale = useLocale() as AppLocale;
  const a = item.analysis;
  if (!a) {
    return (
      <Card className="flex items-start gap-2 border-st-warning-fg/30 bg-st-warning-bg p-3 text-st-warning-fg">
        <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">{t('noResult')}</p>
          <p className="text-xs">{item.aiSkipReason ? t('skipped', { reason: item.aiSkipReason }) : t('noResultHint')}</p>
        </div>
      </Card>
    );
  }
  const pct = Math.round((a.confidence ?? 0) * 100);
  return (
    <Card className="flex flex-col gap-2 p-3" data-testid="ai-verdict">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Bot className="size-4 text-muted-foreground" aria-hidden />
          {t('verdict')}
        </span>
        <VerdictBadge verdict={a.verdict} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{t('confidence')}</span>
          <span className="tabular-nums" data-testid="ai-confidence">
            {formatPercent(a.confidence, locale, 0)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('confidence')}>
          <div className={cn('h-full rounded-full', pct >= 85 ? 'bg-st-success-fg' : pct >= 60 ? 'bg-st-warning-fg' : 'bg-st-danger-fg')} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {a.categoryMatches === false ? (
        <p className="text-xs text-st-warning-fg">
          {t('categoryMismatch')}
          {a.detectedCategory ? ` — ${categoryTitle(a.detectedCategory, locale)}` : ''}
        </p>
      ) : null}
      {a.qualityIssues.length ? (
        <div className="flex flex-wrap gap-1">
          {a.qualityIssues.map((q) => (
            <Badge key={q} tone="warning">
              {t.has(`quality.${q}`) ? t(`quality.${q}`) : q}
            </Badge>
          ))}
        </div>
      ) : null}
      <p className="text-[0.6875rem] text-muted-foreground">
        <span className="ltr-token">{a.provider}/{a.model}</span>
      </p>
    </Card>
  );
}

const SEVERITY_BAR: Record<string, string> = { critical: 'bg-[var(--chart-4)]', major: 'bg-[var(--chart-2)]', minor: 'bg-[var(--chart-1)]' };

export function SnagList({
  item,
  edits,
  selectedId,
  onSelect,
  onRemove,
  onUndoRemove,
  onRemoveStaged,
  onMarkBox,
}: {
  item: QueueItem;
  edits: StagedEdits;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRemove: (snag: SnagDto) => void;
  onUndoRemove: (snagId: string) => void;
  onRemoveStaged: (tempId: string) => void;
  onMarkBox: (tempId: string) => void;
}) {
  const t = useTranslations('review.snags');
  const locale = useLocale() as AppLocale;
  const removed = new Map(edits.removed.map((r) => [r.snagId, r.reason]));
  const empty = item.snags.length === 0 && edits.added.length === 0;
  return (
    <section aria-label={t('title')} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionTitle>{t('title')}</SectionTitle>
        <span className="text-xs text-muted-foreground tabular-nums">{item.snags.length + edits.added.length - removed.size}</span>
      </div>
      {empty ? <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">{t('none')}</p> : null}
      <ol className="flex flex-col gap-1.5">
        {item.snags.map((s, i) => {
          const titles = snagTitles(s.code, locale, s);
          const isRemoved = removed.has(s.id);
          const selected = selectedId === s.id;
          return (
            <li key={s.id} data-testid="ai-snag">
              <div
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onSelect(selected ? null : s.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect(selected ? null : s.id);
                  }
                }}
                className={cn('relative flex cursor-pointer gap-2 overflow-hidden rounded-md border bg-card p-2.5 ps-4', selected && 'ring-2 ring-ring', isRemoved && 'opacity-60')}
              >
                <span className={cn('absolute inset-y-0 start-0 w-1.5', isRemoved ? 'bg-muted-foreground' : SEVERITY_BAR[s.severity])} aria-hidden />
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[0.6875rem] font-semibold tabular-nums" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('font-medium leading-snug', isRemoved && 'line-through')}>{titles.primary}</p>
                  <p className="text-xs text-muted-foreground" lang={locale === 'ar' ? 'en' : 'ar'}>
                    {titles.secondary}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={s.severity} />
                    <span className="ltr-token font-mono text-[0.6875rem] text-muted-foreground">{s.code}</span>
                    {s.bbox ? <Crosshair className="size-3 text-muted-foreground" aria-label={t('hasBox')} /> : null}
                  </div>
                  {isRemoved ? <p className="mt-1 text-xs text-muted-foreground">{t('removedBecause', { reason: removed.get(s.id) ?? '' })}</p> : null}
                </div>
                {isRemoved ? (
                  <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onUndoRemove(s.id); }} aria-label={t('undoRemove')}>
                    <Undo2 aria-hidden />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onRemove(s); }} aria-label={t('remove')} title={`${t('remove')} (X)`}>
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {edits.added.map((a) => {
          const titles = snagTitles(a.code, locale);
          const def = snagDefinition(a.code);
          return (
            <li key={a.tempId} data-testid="staged-snag" className="relative flex gap-2 overflow-hidden rounded-md border border-dashed border-st-violet-fg bg-st-violet-bg/40 p-2.5 ps-4">
              <span className="absolute inset-y-0 start-0 w-1.5 bg-[var(--chart-5)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">{titles.primary}</p>
                <p className="text-xs text-muted-foreground" lang={locale === 'ar' ? 'en' : 'ar'}>
                  {titles.secondary}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="violet">{t('new')}</Badge>
                  <SeverityBadge severity={a.severity} />
                  <span className="ltr-token font-mono text-[0.6875rem] text-muted-foreground">{def?.code ?? a.code}</span>
                  {a.bbox ? <Crosshair className="size-3 text-muted-foreground" aria-label={t('hasBox')} /> : null}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <Button variant="ghost" size="icon-sm" onClick={() => onMarkBox(a.tempId)} aria-label={t('markBox')} title={t('markBox')}>
                  <Crosshair aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => onRemoveStaged(a.tempId)} aria-label={t('discard')} title={t('discard')}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ChecklistSection({ item, activeCodes }: { item: QueueItem; activeCodes: Set<string> }) {
  const t = useTranslations('review.checklist');
  const locale = useLocale() as AppLocale;
  const list = categoryChecklist(item.category);
  const flagged = list.acceptanceCriteria.filter((c) => c.guardsCodes.some((code) => activeCodes.has(code))).length;
  return (
    <details className="group rounded-md border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5">
        <span className="flex flex-col">
          <SectionTitle>{t('title')}</SectionTitle>
          <span className="text-sm font-medium">{locale === 'ar' ? list.titleAr : list.titleEn}</span>
        </span>
        <span className="flex items-center gap-2">
          {flagged ? <Badge tone="danger">{t('flagged', { n: flagged })}</Badge> : null}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <ul className="divide-y border-t">
        {list.acceptanceCriteria.map((c) => {
          const hit = c.guardsCodes.some((code) => activeCodes.has(code));
          return (
            <li key={c.id} className={cn('flex gap-2 px-2.5 py-2 text-[0.8125rem]', hit && 'bg-st-danger-bg/50')}>
              {hit ? <XCircle className="mt-0.5 size-4 shrink-0 text-st-danger-fg" aria-label={t('failing')} /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-label={t('noFinding')} />}
              <div className="min-w-0">
                <span className="ltr-token me-1.5 font-mono text-[0.6875rem] text-muted-foreground">{c.id}</span>
                {locale === 'ar' ? c.textAr : c.textEn}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function MetadataSection({ item, technicianName }: { item: QueueItem; technicianName?: string }) {
  const t = useTranslations('review.meta');
  const locale = useLocale() as AppLocale;
  const site = useQuery({ queryKey: ['site', item.siteId], queryFn: () => getSite(item.siteId), staleTime: 5 * 60_000 });
  const detail = useQuery({ queryKey: ['photo', item.id], queryFn: () => getPhoto(item.id), staleTime: 60_000 });
  const devices = site.data?.devices ?? [];
  const di = detail.data?.deviceInfo;
  return (
    <section aria-label={t('title')} className="flex flex-col gap-2">
      <SectionTitle>{t('title')}</SectionTitle>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem]">
        <Meta label={t('site')}>
          <span className="ltr-token">{item.site.code}</span> · {item.site.name}
        </Meta>
        <Meta label={t('visit')}>{item.visit.title}</Meta>
        <Meta label={t('category')}>{categoryTitle(item.category, locale)}</Meta>
        {devices.length ? (
          <Meta label={t('device')}>
            {devices.map((d) => (
              <span key={d.id} className="block">
                <span className="ltr-token">{d.hostname ?? d.model}</span> <span className="text-muted-foreground">({d.model})</span>
              </span>
            ))}
          </Meta>
        ) : null}
        <Meta label={t('technician')}>{technicianName ?? '—'}</Meta>
        <Meta label={t('captured')}>{formatDateTime(item.capturedAt, locale)}</Meta>
        <Meta label={t('uploaded')}>{formatDateTime(item.uploadedAt, locale)}</Meta>
        <Meta label={t('gps')}>
          {item.gps ? (
            <a
              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              href={`https://www.openstreetmap.org/?mlat=${item.gps.lat}&mlon=${item.gps.lng}#map=18/${item.gps.lat}/${item.gps.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin className="size-3" aria-hidden />
              <span className="ltr-token">{formatGps(item.gps)}</span>
              {item.gps.accuracy !== null ? <span className="text-muted-foreground">±{formatNumber(item.gps.accuracy, locale, { maximumFractionDigits: 0 })} m</span> : null}
            </a>
          ) : (
            t('noGps')
          )}
        </Meta>
        {di ? (
          <Meta label={t('phone')}>
            <span className="ltr-token">{[di.model, di.os].filter(Boolean).join(' · ')}</span>
          </Meta>
        ) : null}
        <Meta label={t('file')}>
          <span className="ltr-token">
            {item.width && item.height ? `${item.width}×${item.height} · ` : ''}
            {formatBytes(item.sizeBytes, locale)}
          </span>
        </Meta>
        <Meta label={t('status')}>
          <PhotoStatusBadge status={item.status} />
        </Meta>
        {item.fixesPhotoId ? <Meta label={t('reshoot')}>{t('reshootOf')}</Meta> : null}
        {item.duplicateOfId ? (
          <Meta label={t('duplicate')}>
            <Badge tone="warning">{t('duplicateWarning')}</Badge>
          </Meta>
        ) : null}
      </dl>
    </section>
  );
}
