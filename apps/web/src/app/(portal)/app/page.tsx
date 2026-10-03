import { getTranslations } from 'next-intl/server';
import { AppDownload } from '@/features/app-download/app-download';

export async function generateMetadata() {
  const t = await getTranslations('app.download');
  return { title: t('title') };
}

export default function Page() {
  return <AppDownload />;
}
