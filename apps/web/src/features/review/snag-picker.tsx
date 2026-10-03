'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import { SeverityBadge } from '@/components/data/status-badges';
import type { AppLocale } from '@/i18n/config';
import type { PhotoCategoryDto } from '@/lib/api/types';
import { searchSnags, type SnagDefinition } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';

/**
 * Searchable taxonomy picker (Arabic or English, also matches the reviewers' own phrases).
 * Keyboard: type to filter, ArrowUp/Down to move, Enter to pick, Esc to close.
 */
export function SnagPicker({
  open,
  onOpenChange,
  category,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: PhotoCategoryDto;
  onPick: (def: SnagDefinition) => void;
}) {
  const t = useTranslations('review.picker');
  const locale = useLocale() as AppLocale;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const results = useMemo(() => searchSnags(query, category), [query, category]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (def: SnagDefinition | undefined): void => {
    if (!def) return;
    onPick(def);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-3 p-4" aria-describedby="picker-desc">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription id="picker-desc">{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="snag-listbox"
            aria-activedescendant={results[active] ? `snag-opt-${results[active].code}` : undefined}
            aria-label={t('search')}
            placeholder={t('placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(results[active]);
              }
            }}
            className="ps-9"
          />
        </div>
        <ul id="snag-listbox" ref={listRef} role="listbox" aria-label={t('results')} className="max-h-[50vh] overflow-y-auto rounded-md border">
          {results.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">{t('none')}</li>
          ) : (
            results.map((def, i) => (
              <li
                key={def.code}
                id={`snag-opt-${def.code}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(def)}
                className={cn('flex cursor-pointer items-start justify-between gap-3 border-b px-3 py-2 last:border-0', i === active && 'bg-accent text-accent-foreground')}
              >
                <div className="min-w-0">
                  <div className="font-medium">{locale === 'ar' ? def.titleAr : def.titleEn}</div>
                  <div className="text-xs text-muted-foreground" lang={locale === 'ar' ? 'en' : 'ar'}>
                    {locale === 'ar' ? def.titleEn : def.titleAr}
                  </div>
                  <div className="ltr-token mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">{def.code}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SeverityBadge severity={def.defaultSeverity} />
                  {def.categories.includes(category) ? <Badge tone="info">{t('forCategory')}</Badge> : null}
                </div>
              </li>
            ))
          )}
        </ul>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> {t('navigate')} <Kbd>Enter</Kbd> {t('select')} <Kbd>Esc</Kbd> {t('close')}
        </p>
      </DialogContent>
    </Dialog>
  );
}
