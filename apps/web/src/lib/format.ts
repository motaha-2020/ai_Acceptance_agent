import type { AppLocale } from '@/i18n/config';

/** Latin digits in Arabic (technical data: counts, IPs, coordinates) via the `nu-latn` extension. */
const INTL_LOCALE: Record<AppLocale, string> = { ar: 'ar-EG-u-nu-latn', en: 'en-GB' };

export function intlLocale(locale: AppLocale): string {
  return INTL_LOCALE[locale];
}

export function formatDateTime(value: string | Date | null | undefined, locale: AppLocale): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(d);
}

export function formatDate(value: string | Date | null | undefined, locale: AppLocale): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium', timeZone: 'Africa/Cairo' }).format(d);
}

export function formatNumber(value: number, locale: AppLocale, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], opts).format(value);
}

export function formatPercent(value: number | null | undefined, locale: AppLocale, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'percent', maximumFractionDigits: digits }).format(value);
}

export function formatBytes(bytes: number, locale: AppLocale): string {
  if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, locale, { maximumFractionDigits: 0 })} KB`;
  return `${formatNumber(bytes / 1024 / 1024, locale, { maximumFractionDigits: 1 })} MB`;
}

/** "5 min ago" style; falls back to a date after a week. */
export function formatRelative(value: string | Date | null | undefined, locale: AppLocale, now: Date = new Date()): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(d, locale);
}

export function formatGps(gps: { lat: number; lng: number } | null | undefined): string {
  if (!gps) return '—';
  return `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`;
}
