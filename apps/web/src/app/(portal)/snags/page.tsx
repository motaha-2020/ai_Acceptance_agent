import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/data/states';
import { SnagTracker } from '@/features/snags/snag-tracker';

export async function generateMetadata() {
  const t = await getTranslations('snagTracker');
  return { title: t('title') };
}

export default async function SnagsPage() {
  const t = await getTranslations('snagTracker');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <SnagTracker />
    </>
  );
}
