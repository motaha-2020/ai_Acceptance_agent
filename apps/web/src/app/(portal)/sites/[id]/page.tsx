import { SiteDetail } from '@/features/sites/site-detail';

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SiteDetail siteId={id} />;
}
