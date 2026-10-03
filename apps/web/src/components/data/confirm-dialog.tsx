'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

/**
 * Promise-based confirm dialog:
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm({ title })) doIt();   // render {dialog} once in the component
 */
export function useConfirm() {
  const t = useTranslations('common');
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean): void => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = (
    <Dialog open={opts !== null} onOpenChange={(open) => !open && close(false)}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>{opts?.title}</DialogTitle>
          {opts?.description ? <DialogDescription>{opts.description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t('cancel')}
          </Button>
          <Button variant={opts?.destructive ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
            {opts?.confirmLabel ?? t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
