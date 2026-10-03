import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/data/states';
import { SitesList } from '@/features/sites/sites-list';

export async function generateMetadata() {
  const t = await getTranslations('sites');
  return { title: t('title') };
}

export default async function SitesPage() {
  const t = await getTranslations('sites');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <SitesList />
    </>
  );
}
