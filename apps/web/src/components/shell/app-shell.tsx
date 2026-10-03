'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useCan } from '@/components/session-provider';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, NAV_ITEMS } from './nav';
import { TopBar } from './top-bar';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const can = useCan();
  const visible = NAV_ITEMS.filter((i) => can(i.needs.action, i.needs.subject));
  return (
    <nav aria-label={t('main')} className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => {
        const items = visible.filter((i) => i.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{t(`group.${group}`)}</p>
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                    active ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground',
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {t(item.label)}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  const t = useTranslations('app');
  return (
    <Link href="/" className="flex items-center gap-2 px-3 py-4 font-semibold">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ScanSearch className="size-4" aria-hidden />
      </span>
      <span className="leading-tight">{t('name')}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('skip')}
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e bg-sidebar md:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <NavLinks />
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen} title={t('main')}>
        <Brand />
        <div className="px-2 pb-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:px-5">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label={t('openMenu')}>
            <Menu aria-hidden />
          </Button>
          <TopBar />
        </header>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-3 outline-none md:p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
