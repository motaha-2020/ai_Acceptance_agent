import { getTranslations } from 'next-intl/server';
import { CatalogAdmin } from '@/features/admin/catalog-admin';
import { RequirePermission } from '@/components/require-permission';

export async function generateMetadata() {
  const t = await getTranslations('admin.catalog');
  return { title: t('title') };
}

export default function Page() {
  return (
    <RequirePermission action="create" subject="Project">
      <CatalogAdmin />
    </RequirePermission>
  );
}
