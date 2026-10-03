import { getTranslations } from 'next-intl/server';
import { UsersAdmin } from '@/features/admin/users-admin';
import { RequirePermission } from '@/components/require-permission';

export async function generateMetadata() {
  const t = await getTranslations('admin.users');
  return { title: t('title') };
}

export default function Page() {
  return (
    <RequirePermission action="create" subject="User">
      <UsersAdmin />
    </RequirePermission>
  );
}
