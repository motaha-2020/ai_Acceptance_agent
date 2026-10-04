import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './config';

/** Locale lives in a cookie (no locale prefix in URLs); English is the default, Arabic one click away. */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Africa/Cairo',
  };
});
