'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, FolderUp, ImageUp, RotateCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSites } from '@/features/common/lookups';
import { confirmCategories, listPhotos, listVisits, uploadPhoto } from '@/lib/api/endpoints';
import type { PhotoCategoryDto, PhotoDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { useErrorMessage } from '@/lib/errors';
import { formatPercent } from '@/lib/format';
import { CATEGORIES, categoryTitle } from '@/lib/taxonomy';
import { chunk, guessCategoryFromPath, isImage, mapLimit } from './plan';

type FileState = 'queued' | 'uploading' | 'done' | 'duplicate' | 'error';
interface QueuedFile {
  key: string;
  file: File;
  path: string;
  clientUuid: string;
  guess: PhotoCategoryDto | undefined;
  state: FileState;
  error?: string;
}

const UPLOAD_CONCURRENCY = 3;

/** ADR 0005 phase A: upload many photos, confirm the AI-proposed categories, then they are analysed and reviewed. */
export function BulkUpload() {
  const t = useTranslations('bulkUpload');
  const locale = useLocale() as AppLocale;
  const errorMessage = useErrorMessage();
  const sites = useSites();
  const [siteId, setSiteId] = useState('');
  const [visitId, setVisitId] = useState('');
  const [fallback, setFallback] = useState<PhotoCategoryDto>('rack');
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [running, setRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const visits = useQuery({
    queryKey: ['visits', 'open-for-upload', siteId],
    queryFn: () => listVisits({ siteId, pageSize: 100 }),
    enabled: !!siteId,
    select: (p) => p.items.filter((v) => v.status === 'planned' || v.status === 'in_progress'),
  });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added: QueuedFile[] = [];
    for (const file of Array.from(list)) {
      if (!isImage(file)) continue;
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      added.push({ key: `${path}:${file.size}:${file.lastModified}`, file, path, clientUuid: crypto.randomUUID(), guess: guessCategoryFromPath(path), state: 'queued' });
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.key));
      return [...prev, ...added.filter((f) => !seen.has(f.key))];
    });
  };

  const setState = (key: string, state: FileState, error?: string) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, state, error } : f)));

  const start = async () => {
    if (!visitId) return;
    setRunning(true);
    const todo = files.filter((f) => f.state === 'queued' || f.state === 'error');
    await mapLimit(todo, UPLOAD_CONCURRENCY, async (f) => {
      setState(f.key, 'uploading');
      try {
        const res = await uploadPhoto(f.file, {
          clientUuid: f.clientUuid,
          visitId,
          category: f.guess ?? fallback,
          captureSource: 'web_bulk',
          uploadBatchId: batchId,
          autoCategory: true,
          fileName: f.path.slice(-300),
          capturedAt: new Date(f.file.lastModified),
        });
        setState(f.key, res.created ? 'done' : 'duplicate');
      } catch (e) {
        setState(f.key, 'error', errorMessage(e));
      }
    });
    setRunning(false);
  };

  const counts = useMemo(() => {
    const c: Record<FileState, number> = { queued: 0, uploading: 0, done: 0, duplicate: 0, error: 0 };
    for (const f of files) c[f.state]++;
    return c;
  }, [files]);
  const uploaded = counts.done + counts.duplicate;
  const finished = files.length > 0 && uploaded === files.length;

  const reset = () => {
    setFiles([]);
    setBatchId(crypto.randomUUID());
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('step1')}</CardTitle>
          <CardDescription>{t('step1Hint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bu-site">{t('site')}</Label>
            <Select value={siteId} onValueChange={(v) => { setSiteId(v); setVisitId(''); }} disabled={running}>
              <SelectTrigger id="bu-site"><SelectValue placeholder={t('choose')} /></SelectTrigger>
              <SelectContent>
                {(sites.data?.items ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{`${s.code} · ${s.name}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bu-visit">{t('visit')}</Label>
            <Select value={visitId} onValueChange={setVisitId} disabled={!siteId || running}>
              <SelectTrigger id="bu-visit"><SelectValue placeholder={siteId && visits.data?.length === 0 ? t('noOpenVisits') : t('choose')} /></SelectTrigger>
              <SelectContent>
                {(visits.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bu-fallback">{t('fallback')}</Label>
            <Select value={fallback} onValueChange={(v) => setFallback(v as PhotoCategoryDto)} disabled={running}>
              <SelectTrigger id="bu-fallback"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{categoryTitle(c, locale)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('step2')}</CardTitle>
          <CardDescription>{t('step2Hint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <input
              ref={folderInput}
              type="file"
              multiple
              hidden
              {...({ webkitdirectory: '' } as Record<string, string>)}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={running}>
              <ImageUp aria-hidden />
              {t('pickFiles')}
            </Button>
            <Button variant="outline" onClick={() => folderInput.current?.click()} disabled={running}>
              <FolderUp aria-hidden />
              {t('pickFolder')}
            </Button>
            <Button onClick={() => void start()} disabled={!visitId || running || counts.queued + counts.error === 0} loading={running}>
              {counts.error > 0 && counts.queued === 0 ? <RotateCw aria-hidden /> : null}
              {counts.error > 0 && counts.queued === 0 ? t('retryFailed') : t('upload', { count: counts.queued + counts.error })}
            </Button>
            {files.length > 0 && !running ? (
              <Button variant="ghost" onClick={reset}>
                {t('newBatch')}
              </Button>
            ) : null}
          </div>
          {files.length > 0 ? (
            <>
              <div className="h-2 overflow-hidden rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={files.length} aria-valuenow={uploaded}>
                <div className="h-full bg-primary transition-all" style={{ width: `${(100 * uploaded) / files.length}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('progress', { uploaded, total: files.length, failed: counts.error })}
              </p>
              {files.filter((f) => f.state === 'error').slice(0, 5).map((f) => (
                <Alert key={f.key} tone="danger">{`${f.path}: ${f.error ?? ''}`}</Alert>
              ))}
            </>
          ) : null}
        </CardContent>
      </Card>

      {uploaded > 0 ? <ConfirmCategories batchId={batchId} done={finished} expected={uploaded} /> : null}
    </div>
  );
}

/** Step 3: the AI-proposed categories of this batch, confirmed (or corrected) by the uploader. */
function ConfirmCategories({ batchId, done, expected }: { batchId: string; done: boolean; expected: number }) {
  const t = useTranslations('bulkUpload');
  const locale = useLocale() as AppLocale;
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [choice, setChoice] = useState<Record<string, PhotoCategoryDto>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const photos = useQuery({
    queryKey: ['bulk-batch', batchId],
    queryFn: async () => {
      const all: PhotoDto[] = [];
      for (let page = 1; page < 50; page++) {
        const p = await listPhotos({ uploadBatchId: batchId, page, pageSize: 200 });
        all.push(...p.items);
        if (all.length >= p.total || p.items.length === 0) break;
      }
      return all.sort((a, b) => (a.fileName ?? '').localeCompare(b.fileName ?? ''));
    },
    // Poll until every photo created in this session is listed and none is still being classified.
    refetchInterval: (q) => {
      const data = q.state.data ?? [];
      return !done || data.length < expected || data.some((p) => p.categoryState === 'classifying') ? 3000 : false;
    },
    // Keep the list ready even if the uploader switches tabs during a long upload.
    refetchIntervalInBackground: true,
  });

  const rows = photos.data ?? [];
  const pending = rows.filter((p) => p.categoryState !== 'confirmed');
  const classifying = rows.filter((p) => p.categoryState === 'classifying').length;
  const value = (p: PhotoDto): PhotoCategoryDto => choice[p.id] ?? p.proposedCategory ?? p.category;
  // Least certain first: those need a look; confident ones can be confirmed in one click.
  const ordered = [...pending].sort((a, b) => (a.categoryConfidence ?? 0) - (b.categoryConfidence ?? 0));

  const confirm = async (ids: string[]) => {
    const ready = ids.filter((id) => rows.find((p) => p.id === id)?.categoryState === 'proposed');
    if (ready.length === 0) return;
    setSaving(true);
    try {
      let confirmed = 0;
      for (const part of chunk(ready, 200)) {
        const res = await confirmCategories(part.map((id) => ({ photoId: id, category: value(rows.find((p) => p.id === id)!) })));
        confirmed += res.confirmed;
      }
      toast.success(t('confirmed', { count: confirmed }));
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ['bulk-batch', batchId] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t('step3')}</CardTitle>
          <CardDescription>{t('step3Hint')}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void confirm([...selected])} disabled={saving || selected.size === 0}>
            {t('confirmSelected', { count: selected.size })}
          </Button>
          <Button onClick={() => void confirm(pending.map((p) => p.id))} disabled={saving || pending.length === 0 || classifying > 0} loading={saving}>
            <CheckCheck aria-hidden />
            {t('confirmAll', { count: pending.length })}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {classifying > 0 ? <Alert tone="info">{t('classifying', { count: classifying })}</Alert> : null}
        {rows.length > 0 && pending.length === 0 ? (
          <Alert tone="success">
            {t('allConfirmed', { count: rows.length })}{' '}
            <Link href="/review" className="font-medium underline">
              {t('openReview')}
            </Link>
          </Alert>
        ) : null}
        {ordered.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t('selectAll')}
                      checked={selected.size > 0 && selected.size === ordered.length}
                      onCheckedChange={(c) => setSelected(c === true ? new Set(ordered.map((p) => p.id)) : new Set())}
                    />
                  </TableHead>
                  <TableHead>{t('photo')}</TableHead>
                  <TableHead>{t('file')}</TableHead>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead>{t('confidence')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={p.fileName ?? p.id}
                        checked={selected.has(p.id)}
                        onCheckedChange={(c) => setSelected((prev) => { const n = new Set(prev); if (c === true) n.add(p.id); else n.delete(p.id); return n; })}
                      />
                    </TableCell>
                    <TableCell>
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <a href={p.urls.web} target="_blank" rel="noreferrer"><img src={p.urls.thumb} alt={p.fileName ?? ''} className="h-14 w-20 rounded object-cover" loading="lazy" /></a>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-xs ltr-token" title={p.fileName ?? ''}>{p.fileName ?? '—'}</TableCell>
                    <TableCell className="min-w-56">
                      {p.categoryState === 'classifying' ? (
                        <Badge tone="info">{t('aiThinking')}</Badge>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Select value={value(p)} onValueChange={(v) => setChoice((prev) => ({ ...prev, [p.id]: v as PhotoCategoryDto }))}>
                            <SelectTrigger aria-label={`${t('category')}: ${p.fileName ?? ''}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>{categoryTitle(c, locale)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {p.proposedAlternative && p.proposedAlternative !== value(p) ? (
                            <button type="button" className="text-start text-xs text-primary underline" onClick={() => setChoice((prev) => ({ ...prev, [p.id]: p.proposedAlternative! }))}>
                              {t('orAlternative', { category: categoryTitle(p.proposedAlternative, locale) })}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.categoryConfidence !== null ? (
                        <Badge tone={p.categoryConfidence >= 0.85 ? 'success' : p.categoryConfidence >= 0.6 ? 'warning' : 'danger'}>{formatPercent(p.categoryConfidence, locale)}</Badge>
                      ) : p.categoryState === 'proposed' ? (
                        <Badge tone="neutral">{t('noProposal')}</Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
