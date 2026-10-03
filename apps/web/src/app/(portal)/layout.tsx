import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { SessionProvider } from '@/components/session-provider';
import { getMe } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  return (
    <SessionProvider me={me}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
