import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/data/states';
import { AccuracyDashboard } from '@/features/accuracy/accuracy-dashboard';

export async function generateMetadata() {
  const t = await getTranslations('accuracy');
  return { title: t('title') };
}

export default async function AccuracyPage() {
  const t = await getTranslations('accuracy');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <AccuracyDashboard />
    </>
  );
}
