import { getTranslations } from 'next-intl/server';
import { ScanSearch } from 'lucide-react';
import { LoginForm } from '@/features/auth/login-form';
import { LanguageToggle, ThemeToggle } from '@/components/shell/top-bar';
import { safeNext } from '@/lib/auth/constants';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: t('title') };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const t = await getTranslations('auth');
  const tApp = await getTranslations('app');
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex justify-end gap-1 p-3">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ScanSearch className="size-6" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold">{tApp('name')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <LoginForm next={safeNext(next)} />
        </div>
      </div>
    </main>
  );
}
