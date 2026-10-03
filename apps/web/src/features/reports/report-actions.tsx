'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { ReportDto, ReportFormat } from '@acceptance/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/components/session-provider';
import { ApiRequestError } from '@/lib/api/client';
import { createSiteReport, formatBytes, isBuilding, listSiteReports, reportDownload } from './reports-api';
import type { ReportStrings } from './report-strings';

const STATUS_TONE: Record<ReportDto['status'], BadgeTone> = { queued: 'info', running: 'info', ready: 'success', failed: 'danger' };

export const siteReportsKey = (siteId: string) => ['site-reports', siteId] as const;

function useSiteReports(siteId: string) {
  return useQuery({
    queryKey: siteReportsKey(siteId),
    queryFn: () => listSiteReports(siteId),
    refetchInterval: (q) => (isBuilding(q.state.data?.[0]) ? 2500 : false),
  });
}

async function openDownload(id: string, format: ReportFormat): Promise<void> {
  try {
    const { url } = await reportDownload(id, format);
    window.open(url, '_blank', 'noopener');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  }
}

/** Latest report of a site: status, version, downloads and warnings. */
export function LatestReport({ siteId, s }: { siteId: string; s: ReportStrings }) {
  const q = useSiteReports(siteId);
  if (q.isLoading) return <Skeleton className="h-5 w-24" />;
  const r = q.data?.[0];
  if (!r) return <span className="text-xs text-muted-foreground">{s.none}</span>;
  const c = r.meta?.checklist;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[r.status]}>{s[r.status]}</Badge>
        <span className="ltr-token font-mono text-xs">v{r.version}</span>
        {r.draft ? <Badge tone="warning">{s.draftTag}</Badge> : null}
      </div>
      {r.status === 'ready' ? (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => void openDownload(r.id, 'docx')} title={formatBytes(r.docxBytes)}>
            <Download aria-hidden />
            {s.docx}
          </Button>
          {r.hasPdf ? (
            <Button size="sm" variant="outline" onClick={() => void openDownload(r.id, 'pdf')} title={formatBytes(r.pdfBytes)}>
              <Download aria-hidden />
              {s.pdf}
            </Button>
          ) : null}
        </div>
      ) : null}
      {r.status === 'failed' && r.error ? <span className="text-xs text-st-danger-fg">{r.error}</span> : null}
      {c ? <span className="text-xs text-muted-foreground">{s.checklist(c.pass, c.fail, c.na + c.manual)}</span> : null}
      {r.warnings.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-st-warning-fg">{s.warnings(r.warnings.length)}</summary>
          <ul className="mt-1 list-disc ps-4 text-muted-foreground">
            {r.warnings.map((w) => (
              <li key={w} className="ltr-token">{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Generate buttons: final (only when the site is ready) and draft. Hidden without permission. */
export function GenerateReport({ siteId, canFinal, s }: { siteId: string; canFinal: boolean; s: ReportStrings }) {
  const can = useCan();
  const qc = useQueryClient();
  const reports = useSiteReports(siteId);
  const create = useMutation({
    mutationFn: (draft: boolean) => createSiteReport(siteId, draft),
    onSuccess: (r) => {
      toast.success(s.queuedToast(r.version));
      void qc.invalidateQueries({ queryKey: siteReportsKey(siteId) });
    },
    onError: (e) => toast.error(e instanceof ApiRequestError || e instanceof Error ? e.message : String(e)),
  });
  if (!can('create', 'Report')) return null;
  const busy = create.isPending || isBuilding(reports.data?.[0]);
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" disabled={!canFinal || busy} loading={create.isPending && create.variables === false} title={canFinal ? s.finalHint : s.finalBlocked} onClick={() => create.mutate(false)}>
        <FileText aria-hidden />
        {s.final}
      </Button>
      <Button size="sm" variant="outline" disabled={busy} loading={create.isPending && create.variables === true} title={s.draftHint} onClick={() => create.mutate(true)}>
        {s.draft}
      </Button>
    </div>
  );
}
