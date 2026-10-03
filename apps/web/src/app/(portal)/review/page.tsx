import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { ReviewPage } from '@/features/review/review-page';

export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('review') };
}

export default function Page() {
  return (
    <Suspense>
      <ReviewPage />
    </Suspense>
  );
}
