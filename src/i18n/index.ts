import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ar from './locales/ar.json';
import fr from './locales/fr.json';
import zh from './locales/zh.json';

const STORAGE_KEY = "organyze.settings.v1";

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const settings = JSON.parse(raw);
      const lang = settings.language || 'en';
      // Map old display names to codes
      const langMap: Record<string, string> = {
        'English': 'en',
        'Arabic': 'ar',
        'French': 'fr',
        'Chinese': 'zh',
      };
      return langMap[lang] || lang;
    }
  } catch {
    // ignore
  }
  return 'en';
};

const resources = {
  en: {
    translation: en,
  },
  ar: {
    translation: ar,
  },
  fr: {
    translation: fr,
  },
  zh: {
    translation: zh,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: loadSettings(), // load from settings
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;