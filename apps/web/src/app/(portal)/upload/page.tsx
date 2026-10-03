import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/data/states';
import { RequirePermission } from '@/components/require-permission';
import { BulkUpload } from '@/features/bulk-upload/bulk-upload';

export async function generateMetadata() {
  const t = await getTranslations('bulkUpload');
  return { title: t('title') };
}

export default async function UploadPage() {
  const t = await getTranslations('bulkUpload');
  return (
    <RequirePermission action="upload" subject="Visit">
      <PageHeader title={t('title')} description={t('description')} />
      <BulkUpload />
    </RequirePermission>
  );
}
