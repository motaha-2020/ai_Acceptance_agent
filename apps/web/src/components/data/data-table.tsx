'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingRows } from '@/components/data/states';
import { cn } from '@/lib/utils';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Provide to make the column sortable. The API has no sort parameter yet, so sorting applies to the loaded page. */
  sortValue?: (row: T) => string | number | null | undefined;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<Column<T>>;
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Server pagination (1-based page). */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  caption: string;
  toolbar?: ReactNode;
  pageSizes?: number[];
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRowClick,
  rowLabel,
  caption,
  toolbar,
  pageSizes = [10, 25, 50, 100],
}: DataTableProps<T>) {
  const t = useTranslations('table');
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * mul;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  function toggleSort(id: string): void {
    setSort((s) => (s?.id !== id ? { id, dir: 'asc' } : s.dir === 'asc' ? { id, dir: 'desc' } : null));
  }

  return (
    <div className="flex flex-col gap-3">
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      <div className="rounded-lg border bg-card">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} className="m-3" />
        ) : isLoading ? (
          <LoadingRows className="p-3" />
        ) : !sorted || sorted.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} className="m-3 border-0" />
        ) : (
          <Table>
            <caption className="sr-only">{caption}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((c) => {
                  const active = sort?.id === c.id;
                  return (
                    <TableHead key={c.id} className={c.className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}>
                      {c.sortValue ? (
                        <button type="button" onClick={() => toggleSort(c.id)} className="inline-flex items-center gap-1 rounded-sm hover:text-foreground">
                          {c.header}
                          {active ? sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : <ChevronsUpDown className="size-3 opacity-50" aria-hidden />}
                        </button>
                      ) : (
                        c.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? rowLabel?.(row) : undefined}
                >
                  {columns.map((c) => (
                    <TableCell key={c.id} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {!error && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span aria-live="polite">{t('range', { from, to, total })}</span>
          <div className="flex items-center gap-2">
            {onPageSizeChange ? (
              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger className="h-8 w-28" aria-label={t('pageSize')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizes.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {t('perPage', { n: s })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t('previous')}>
              <ChevronLeft className="rtl:-scale-x-100" aria-hidden />
            </Button>
            <span className="min-w-16 text-center tabular-nums">{t('pageOf', { page, pages })}</span>
            <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label={t('next')}>
              <ChevronRight className="rtl:-scale-x-100" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
