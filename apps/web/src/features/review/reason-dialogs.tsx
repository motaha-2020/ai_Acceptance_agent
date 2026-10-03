'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Kbd } from '@/components/ui/kbd';
import { SeverityBadge, VerdictBadge } from '@/components/data/status-badges';
import type { AppLocale } from '@/i18n/config';
import type { QueueItem, SnagDto } from '@/lib/api/types';
import { snagTitles } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import { planDecision, planErrorKeyOf, type FinalVerdict, type StagedEdits } from './plan';

const QUICK = ['falsePositive', 'notVisible', 'acceptable', 'wrongCode'] as const;

/** Why is the reviewer removing this AI snag? (kept with the immutable review as a negative label). */
export function RemoveSnagDialog({ snag, onConfirm, onClose }: { snag: SnagDto | null; onConfirm: (reason: string) => void; onClose: () => void }) {
  const t = useTranslations('review.remove');
  const locale = useLocale() as AppLocale;
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [snag?.id]);
  const titles = snag ? snagTitles(snag.code, locale, snag) : null;
  const submit = (): void => {
    if (reason.trim()) onConfirm(reason.trim());
  };
  return (
    <Dialog open={!!snag} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{titles?.primary}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <Button key={q} type="button" variant="outline" size="sm" onClick={() => setReason(t(`quick.${q}`))}>
              {t(`quick.${q}`)}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="remove-reason">{t('reason')}</Label>
          <Textarea
            id="remove-reason"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!reason.trim()}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Final call: accept or reject, with a reason (required for overrides). Shows exactly what will be sent. */
export function DecisionDialog({
  open,
  item,
  edits,
  initialVerdict,
  submitting,
  onSubmit,
  onClose,
}: {
  open: boolean;
  item: QueueItem;
  edits: StagedEdits;
  initialVerdict: FinalVerdict;
  submitting?: boolean;
  onSubmit: (verdict: FinalVerdict, reason: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('review.decision');
  const tErr = useTranslations('review.planError');
  const [verdict, setVerdict] = useState<FinalVerdict>(initialVerdict);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setVerdict(initialVerdict);
      setReason('');
      setTouched(false);
    }
  }, [open, initialVerdict, item.id]);

  const result = planDecision(item, edits, verdict, reason);
  const blocking = !result.ok && (touched || result.error !== 'reason_required') ? result.error : null;
  const dismissCount = verdict === 'accept' ? item.snags.length : edits.removed.length;
  const submit = (): void => {
    setTouched(true);
    if (result.ok) onSubmit(verdict, reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {t('aiSaid')} <VerdictBadge verdict={item.analysis?.verdict} />
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">{t('final')}</legend>
          {(['accept', 'reject'] as const).map((v) => (
            <label
              key={v}
              className={cn(
                'flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                verdict === v && (v === 'accept' ? 'border-st-success-fg bg-st-success-bg' : 'border-st-danger-fg bg-st-danger-bg'),
              )}
            >
              <input type="radio" name="verdict" className="sr-only" checked={verdict === v} onChange={() => setVerdict(v)} />
              <span className="font-semibold">{t(v)}</span>
              <span className="text-xs text-muted-foreground">{t(`${v}Hint`)}</span>
            </label>
          ))}
        </fieldset>

        <ul className="space-y-1 rounded-md bg-muted p-3 text-sm">
          {edits.added.length ? <li>{t('willAdd', { n: edits.added.length })}</li> : null}
          {dismissCount ? <li>{t('willDismiss', { n: dismissCount })}</li> : null}
          {!edits.added.length && !dismissCount ? <li className="text-muted-foreground">{t('noSnagChanges')}</li> : null}
        </ul>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decision-reason">
            {t('reason')}
            {result.ok && result.plan.decision === 'add_snag' ? <span className="ms-1 font-normal text-muted-foreground">({t('optional')})</span> : null}
          </Label>
          <Textarea
            id="decision-reason"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            aria-invalid={blocking === 'reason_required'}
            maxLength={1500}
          />
        </div>

        {blocking ? (
          <p role="alert" className="text-sm text-destructive">
            {tErr(planErrorKeyOf(blocking))}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant={verdict === 'accept' ? 'success' : 'destructive'} onClick={submit} loading={submitting}>
            {verdict === 'accept' ? t('submitAccept') : t('submitReject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('review.shortcuts');
  const rows: Array<[string[], string]> = [
    [['A'], 'agree'],
    [['R'], 'reject'],
    [['S'], 'addSnag'],
    [['N', '→'], 'next'],
    [['P', '←'], 'prev'],
    [['1', '…', '9'], 'select'],
    [['X'], 'removeSelected'],
    [['B'], 'boxes'],
    [['+', '−', '0'], 'zoom'],
    [['Enter'], 'submitEdits'],
    [['?'], 'help'],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          {rows.map(([keys, key]) => (
            <div key={key} className="contents">
              <dt className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dt>
              <dd>{t(`actions.${key}`)}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
