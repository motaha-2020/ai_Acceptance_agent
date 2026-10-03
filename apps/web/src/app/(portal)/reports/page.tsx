import { getTranslations } from 'next-intl/server';
import { ReportsPage } from '@/features/reports/reports-page';

export async function generateMetadata() {
  const t = await getTranslations('reports');
  return { title: t('title') };
}

export default function Page() {
  return <ReportsPage />;
}
