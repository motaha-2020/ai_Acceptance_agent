import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { ar, en } from './messages';

export type Lang = 'ar' | 'en';
const LANG_KEY = 'ui.lang';

/** Arabic (RTL) by default; the choice is remembered on the device. */
export async function initI18n(): Promise<Lang> {
  let lang: Lang = 'ar';
  try {
    const saved = await SecureStore.getItemAsync(LANG_KEY);
    if (saved === 'en' || saved === 'ar') lang = saved;
  } catch {
    // keep default
  }
  await i18n.use(initReactI18next).init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    lng: lang,
    fallbackLng: 'ar',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDirection(lang);
  return lang;
}

function applyDirection(lang: Lang): boolean {
  const rtl = lang === 'ar';
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}

/** Switch language; layout direction needs a JS reload to take effect. */
export async function setLanguage(lang: Lang): Promise<void> {
  await SecureStore.setItemAsync(LANG_KEY, lang);
  await i18n.changeLanguage(lang);
  if (applyDirection(lang)) {
    await Updates.reloadAsync().catch(() => undefined);
  }
}

export function currentLang(): Lang {
  return i18n.language === 'en' ? 'en' : 'ar';
}

export { i18n };
