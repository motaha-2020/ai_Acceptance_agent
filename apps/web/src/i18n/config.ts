export const LOCALES = ['ar', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
