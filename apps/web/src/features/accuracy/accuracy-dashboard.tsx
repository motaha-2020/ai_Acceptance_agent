'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ALL, FilterSelect, pickValue } from '@/components/data/filter-select';
import { EmptyState, ErrorState } from '@/components/data/states';
import { useProjects } from '@/features/common/lookups';
import { getAgreementMetrics } from '@/lib/api/endpoints';
import type { AgreementMetricsDto, CategoryAgreementDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { categoryTitle } from '@/lib/taxonomy';

const PERIODS = ['7', '30', '90', 'all'] as const;
type Period = (typeof PERIODS)[number];
const WEEKS = 8;
const DAY = 86_400_000;

/** Bucket boundaries for the trend: the last N weeks ending now. */
export function weekWindows(now: Date, weeks = WEEKS): Array<{ from: Date; to: Date }> {
  const out: Array<{ from: Date; to: Date }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = new Date(now.getTime() - i * 7 * DAY);
    out.push({ from: new Date(to.getTime() - 7 * DAY), to });
  }
  return out;
}

export type CategoryStatus = 'meets' | 'below' | 'needsSamples' | 'noPolicy' | 'noData';

export function categoryStatus(c: CategoryAgreementDto): CategoryStatus {
  if (c.withAi === 0) return 'noData';
  if (!c.policy) return 'noPolicy';
  if (c.meetsThreshold) return 'meets';
  return c.withAi < c.policy.minSamples ? 'needsSamples' : 'below';
}

const STATUS_TONE = { meets: 'success', below: 'danger', needsSamples: 'warning', noPolicy: 'neutral', noData: 'neutral' } as const;

export function AccuracyDashboard() {
  const t = useTranslations('accuracy');
  const locale = useLocale() as AppLocale;
  const [projectId, setProjectId] = useState<string | undefined>();
  const [period, setPeriod] = useState<Period>('all');
  const projects = useProjects();

  const range = useMemo(() => {
    if (period === 'all') return {};
    return { from: new Date(Date.now() - Number(period) * DAY).toISOString() };
  }, [period]);
  const metrics = useQuery({ queryKey: ['metrics', 'agreement', projectId, range], queryFn: () => getAgreementMetrics({ projectId, ...range }) });

  const windows = useMemo(() => weekWindows(new Date()), []);
  const trend = useQueries({
    queries: windows.map((w) => ({
      queryKey: ['metrics', 'trend', projectId, w.from.toISOString()],
      queryFn: () => getAgreementMetrics({ projectId, from: w.from.toISOString(), to: w.to.toISOString() }),
      staleTime: 5 * 60_000,
    })),
  });

  const trendData = windows.map((w, i) => {
    const d: AgreementMetricsDto | undefined = trend[i]?.data;
    return {
      label: formatDate(w.to, locale),
      agreement: d?.totals.agreementRate != null ? Math.round(d.totals.agreementRate * 1000) / 10 : null,
      reviewed: d?.totals.withAi ?? 0,
    };
  });
  const trendLoading = trend.some((q) => q.isLoading);

  const cats = (metrics.data?.categories ?? []).filter((c) => c.withAi > 0);
  const chartData = [...cats]
    .sort((a, b) => (a.agreementRate ?? 0) - (b.agreementRate ?? 0))
    .map((c) => ({
      name: categoryTitle(c.category, locale),
      agreement: Math.round((c.agreementRate ?? 0) * 1000) / 10,
      required: Math.round((c.policy?.minAgreement ?? 0) * 1000) / 10,
    }));

  const totals = metrics.data?.totals;
  const kpis: Array<{ label: string; value: string; hint?: string }> = totals
    ? [
        { label: t('kpi.reviewed'), value: formatNumber(totals.reviewed, locale), hint: t('kpi.withAi', { n: formatNumber(totals.withAi, locale) }) },
        { label: t('kpi.agreement'), value: formatPercent(totals.agreementRate, locale), hint: t('kpi.agreementHint') },
        { label: t('kpi.verdictAccuracy'), value: formatPercent(totals.verdictAccuracy, locale), hint: t('kpi.verdictHint') },
        { label: t('kpi.overrides'), value: formatNumber(totals.override, locale), hint: t('kpi.overridesHint', { n: formatNumber(totals.addSnag, locale) }) },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">{t('phaseNote')}</Alert>
      <div className="flex flex-wrap gap-2">
        <FilterSelect label={t('filters.project')} value={projectId ?? ALL} onChange={(v) => setProjectId(pickValue(v))}>
          <SelectItem value={ALL}>{t('filters.allProjects')}</SelectItem>
          {projects.data?.items.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect label={t('filters.period')} value={period} onChange={(v) => setPeriod(v as Period)}>
          {PERIODS.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`filters.periods.${p}`)}
            </SelectItem>
          ))}
        </FilterSelect>
      </div>

      {metrics.error ? (
        <ErrorState error={metrics.error} onRetry={() => void metrics.refetch()} />
      ) : metrics.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label}>
                <CardHeader>
                  <CardDescription>{k.label}</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{k.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{k.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {cats.length === 0 ? (
            <EmptyState title={t('empty')} description={t('emptyHint')} />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('byCategory.title')}</CardTitle>
                  <CardDescription>{t('byCategory.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div role="img" aria-label={t('byCategory.aria', { n: cats.length })} style={{ height: Math.max(220, chartData.length * 44 + 60) }} dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={6}>
                        <CartesianGrid horizontal={false} stroke="var(--border)" />
                        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'var(--foreground)', fontSize: 12 }} />
                        <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', color: 'var(--popover-foreground)', borderRadius: 6 }} />
                        <Legend />
                        <Bar dataKey="agreement" name={t('byCategory.agreement')} fill="var(--chart-1)" radius={[0, 3, 3, 0]} />
                        <Bar dataKey="required" name={t('byCategory.required')} fill="var(--chart-2)" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('trend.title')}</CardTitle>
                  <CardDescription>{t('trend.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {trendLoading ? (
                    <Skeleton className="h-64" />
                  ) : (
                    <div role="img" aria-label={t('trend.aria')} style={{ height: 280 }} dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trendData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                          <CartesianGrid vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                          <YAxis yAxisId="pct" domain={[0, 100]} unit="%" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} width={44} />
                          <YAxis yAxisId="n" orientation="right" allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} width={36} />
                          <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', color: 'var(--popover-foreground)', borderRadius: 6 }} />
                          <Legend />
                          <Bar yAxisId="n" dataKey="reviewed" name={t('trend.volume')} fill="var(--chart-3)" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
                          <Line yAxisId="pct" type="monotone" dataKey="agreement" name={t('trend.agreement')} stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('table.title')}</CardTitle>
              <CardDescription>{t('table.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <caption className="sr-only">{t('table.title')}</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.category')}</TableHead>
                    <TableHead>{t('table.samples')}</TableHead>
                    <TableHead>{t('table.agree')}</TableHead>
                    <TableHead>{t('table.override')}</TableHead>
                    <TableHead>{t('table.addSnag')}</TableHead>
                    <TableHead>{t('table.agreement')}</TableHead>
                    <TableHead>{t('table.required')}</TableHead>
                    <TableHead>{t('table.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(metrics.data?.categories ?? []).map((c) => {
                    const st = categoryStatus(c);
                    return (
                      <TableRow key={c.category}>
                        <TableCell className="font-medium">{categoryTitle(c.category, locale)}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatNumber(c.withAi, locale)}
                          {c.policy ? <span className="text-muted-foreground"> / {formatNumber(c.policy.minSamples, locale)}</span> : null}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatNumber(c.agree, locale)}</TableCell>
                        <TableCell className="tabular-nums">{formatNumber(c.override, locale)}</TableCell>
                        <TableCell className="tabular-nums">{formatNumber(c.addSnag, locale)}</TableCell>
                        <TableCell className="tabular-nums">{formatPercent(c.agreementRate, locale)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{c.policy ? formatPercent(c.policy.minAgreement, locale, 0) : '—'}</TableCell>
                        <TableCell>
                          <Badge tone={STATUS_TONE[st]}>{t(`status.${st}`)}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
