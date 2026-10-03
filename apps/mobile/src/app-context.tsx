import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUserDto } from './lib/api/schemas';
import { getServices, type QueueSnapshot, type Services } from './services';

interface AppContextValue {
  services: Services;
  user: AuthUserDto | null;
  queue: QueueSnapshot;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ services, children }: { services: Services; children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(services.session.user);
  const [queue, setQueue] = useState<QueueSnapshot>(services.queueSnapshot);

  useEffect(() => services.session.subscribe(setUser), [services]);
  useEffect(() => services.subscribe(setQueue), [services]);
  useEffect(() => services.startForeground(), [services]);
  useEffect(() => {
    void services.refreshCounts();
  }, [services, user]);

  return <Ctx.Provider value={{ services, user, queue }}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

export { getServices };
