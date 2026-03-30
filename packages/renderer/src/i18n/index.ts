/**
 * Application i18n bootstrap and language synchronization helpers.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUSResources } from './resources/en-US';
import {
  APP_LANGUAGE_SETTING_KEY,
  DEFAULT_APP_LANGUAGE,
  normalizeAppLanguage,
  type AppLanguage,
} from './language';
import { zhCNResources } from './resources/zh-CN';

type TranslationPrimitive = string | number | boolean;
type AppLanguageChangedListener = (language: AppLanguage) => void;

interface SettingsChangedPayload {
  key?: string | null;
  value?: string | number | boolean | null;
  updatedKeys?: string[];
  reset?: boolean;
  imported?: boolean;
}

export { APP_LANGUAGE_SETTING_KEY, DEFAULT_APP_LANGUAGE, type AppLanguage } from './language';

export const appI18n = i18n.createInstance();

const resources = {
  'zh-CN': {
    translation: zhCNResources,
  },
  'en-US': {
    translation: enUSResources,
  },
} as const;

let initializationPromise: Promise<void> | null = null;

const setDocumentLanguage = (language: AppLanguage): void => {
  document.documentElement.lang = language;
};

const resolveNavigatorLanguage = (): AppLanguage => {
  if (typeof navigator === 'undefined') {
    return DEFAULT_APP_LANGUAGE;
  }

  return normalizeAppLanguage(navigator.language);
};

const readConfiguredLanguage = async (): Promise<AppLanguage> => {
  const response = await window.electronAPI?.settings?.get(APP_LANGUAGE_SETTING_KEY);

  if (typeof response?.data === 'string') {
    return normalizeAppLanguage(response.data);
  }

  return resolveNavigatorLanguage();
};

export const changeAppLanguage = async (language: string): Promise<AppLanguage> => {
  const normalizedLanguage = normalizeAppLanguage(language);

  if (!appI18n.isInitialized) {
    await initializeAppI18n();
  }

  if (appI18n.language !== normalizedLanguage) {
    await appI18n.changeLanguage(normalizedLanguage);
  }

  setDocumentLanguage(normalizedLanguage);

  return normalizedLanguage;
};

export const syncAppLanguageFromSettings = async (): Promise<AppLanguage> => {
  const configuredLanguage = await readConfiguredLanguage();
  return changeAppLanguage(configuredLanguage);
};

export const initializeAppI18n = async (): Promise<void> => {
  if (appI18n.isInitialized) {
    setDocumentLanguage(normalizeAppLanguage(appI18n.language));
    return;
  }

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    const initialLanguage = await readConfiguredLanguage();

    await appI18n
      .use(initReactI18next)
      .init({
        resources,
        lng: initialLanguage,
        fallbackLng: DEFAULT_APP_LANGUAGE,
        defaultNS: 'translation',
        ns: ['translation'],
        interpolation: {
          escapeValue: false,
        },
      });

    setDocumentLanguage(initialLanguage);
  })();

  await initializationPromise;
};

export const subscribeToAppLanguageSettings = (): (() => void) => {
  const unsubscribe = window.electronAPI?.on?.(
    'settings:changed',
    (payload: SettingsChangedPayload): void => {
      if (payload.reset || payload.imported) {
        void syncAppLanguageFromSettings();
        return;
      }

      if ((payload.updatedKeys ?? []).includes(APP_LANGUAGE_SETTING_KEY)) {
        void syncAppLanguageFromSettings();
        return;
      }

      if (payload.key === APP_LANGUAGE_SETTING_KEY && typeof payload.value === 'string') {
        void changeAppLanguage(payload.value);
      }
    }
  );

  return () => {
    unsubscribe?.();
  };
};

export const onAppLanguageChanged = (
  listener: AppLanguageChangedListener
): (() => void) => {
  const handleLanguageChanged = (language: string): void => {
    listener(normalizeAppLanguage(language));
  };

  appI18n.on('languageChanged', handleLanguageChanged);

  return () => {
    appI18n.off('languageChanged', handleLanguageChanged);
  };
};

export const getCurrentAppLanguage = (): AppLanguage => (
  normalizeAppLanguage(appI18n.language || resolveNavigatorLanguage())
);

export const translate = (
  key: string,
  values?: Record<string, TranslationPrimitive>
): string => appI18n.t(key, values);
