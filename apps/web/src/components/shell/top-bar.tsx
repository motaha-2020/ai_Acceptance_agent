'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Languages, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/components/session-provider';
import type { AppLocale } from '@/i18n/config';

export function LanguageToggle() {
  const t = useTranslations('topbar');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const next: AppLocale = locale === 'ar' ? 'en' : 'ar';
  async function switchTo(): Promise<void> {
    await fetch('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: next }) });
    router.refresh();
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => void switchTo()} aria-label={t('switchLanguage')} title={t('switchLanguage')}>
      <Languages aria-hidden />
      <span lang={next}>{next === 'ar' ? 'العربية' : 'English'}</span>
    </Button>
  );
}

export function ThemeToggle() {
  const t = useTranslations('topbar');
  const { theme, setTheme } = useTheme();
  const options = [
    { value: 'light', icon: Sun, label: t('theme.light') },
    { value: 'dark', icon: Moon, label: t('theme.dark') },
    { value: 'system', icon: Monitor, label: t('theme.system') },
  ] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('theme.label')}>
          <Sun className="dark:hidden" aria-hidden />
          <Moon className="hidden dark:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => setTheme(o.value)}>
            <o.icon aria-hidden />
            {o.label}
            {theme === o.value ? <Check className="ms-auto" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu() {
  const me = useSession();
  const t = useTranslations('topbar');
  const tRole = useTranslations('roles');
  const router = useRouter();
  const qc = useQueryClient();
  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    qc.clear();
    router.replace('/login');
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" data-testid="user-menu">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
            {me.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{me.name}</span>
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="text-sm font-medium text-foreground">{me.name}</div>
          <div className="ltr-token text-xs font-normal">{me.email}</div>
          <div className="mt-0.5 text-xs font-normal">{tRole(me.role)}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut aria-hidden className="rtl:-scale-x-100" />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  return (
    <div className="flex flex-1 items-center justify-end gap-1">
      <LanguageToggle />
      <ThemeToggle />
      <UserMenu />
    </div>
  );
}
