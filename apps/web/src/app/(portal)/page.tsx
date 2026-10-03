import { redirect } from 'next/navigation';
import { can } from '@/lib/rbac';
import { getMe } from '@/lib/server/session';

/** Landing: reviewers go straight to the queue, everyone else to the sites overview. */
export default async function HomePage() {
  const me = await getMe();
  if (can(me.role, 'review', 'Photo')) redirect('/review');
  if (can(me.role, 'read', 'Site')) redirect('/sites');
  redirect('/app');
}
