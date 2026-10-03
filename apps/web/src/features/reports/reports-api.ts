import type { ReportDownloadDto, ReportDto, ReportFormat } from '@acceptance/shared';
import { apiFetch } from '@/lib/api/client';

/** Report endpoints (P6). Kept with the feature; the shared endpoints module is owned by the portal. */
export const listSiteReports = (siteId: string): Promise<ReportDto[]> => apiFetch(`/sites/${siteId}/reports`);
export const createSiteReport = (siteId: string, draft: boolean): Promise<ReportDto> => apiFetch(`/sites/${siteId}/reports`, { method: 'POST', body: { draft } });
export const reportDownload = (id: string, format: ReportFormat): Promise<ReportDownloadDto> => apiFetch(`/reports/${id}/download`, { query: { format } });

/** Poll while the newest report is still being built. */
export const isBuilding = (r: ReportDto | undefined): boolean => r?.status === 'queued' || r?.status === 'running';

export function formatBytes(n: number | null): string {
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
