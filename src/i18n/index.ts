import { createInstance } from 'i18next';
import { useEffect } from 'react';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import uk from './uk.json';
import zh from './zh.json';

/**
 * Keys come from FileBrowser Quantum's frontend/src/i18n/en.json. The app is a private family
 * build and always shows Simplified Chinese; en/uk stay as fallbacks for keys we missed.
 */
const resources = { en: { translation: en }, uk: { translation: uk }, zh: { translation: zh } };
type Language = keyof typeof resources;

// 私人家庭网盘：界面固定简体中文
let current: { language: Language; tag: string } = { language: 'zh', tag: 'zh-CN' };

/** Locale for dates and numbers, matching the language the app is shown in (e.g. "uk-UA"). */
export function formatLocale(): string {
  return current.tag;
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: current.language,
  fallbackLng: 'en',
  interpolation: {
    prefix: '{',
    suffix: '}',
    escapeValue: false,
  },
  missingInterpolationHandler: () => '',
  returnNull: false,
});

/**
 * Follows changes to the system (or per-app) language while the app runs. Android keeps the
 * app alive across a language change, so this has to happen at runtime.
 */
export function useLanguageSync() {
  // 固定使用简体中文，不再跟随系统语言。
  useEffect(() => {
    if (i18n.language !== 'zh') void i18n.changeLanguage('zh');
  }, []);
}

export default i18n;
