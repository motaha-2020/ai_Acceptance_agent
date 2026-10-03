import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import type { Me } from '@/lib/api/types';
import { apiBaseUrl } from './env';

/**
 * Current user for server components. Middleware guarantees a fresh access cookie on page
 * requests; if the API still rejects it (user deactivated, secret rotated) the session is
 * dropped via /api/auth/signout, which clears the cookies (avoids a login<->home redirect loop).
 */
export async function getMe(): Promise<Me> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) redirect('/login');
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/api/v1/auth/me`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    throw new Error('API_UNREACHABLE');
  }
  if (res.status === 401 || res.status === 403) redirect('/api/auth/signout');
  if (!res.ok) throw new Error(`API_ERROR_${res.status}`);
  return (await res.json()) as Me;
}
