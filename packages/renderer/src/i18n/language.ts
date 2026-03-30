/**
 * Application language constants and helpers.
 */

export const APP_LANGUAGE_SETTING_KEY = 'application.language';

export const APP_LANGUAGE_VALUES = ['zh-CN', 'en-US'] as const;

export type AppLanguage = (typeof APP_LANGUAGE_VALUES)[number];

export const DEFAULT_APP_LANGUAGE: AppLanguage = 'zh-CN';

const APP_LANGUAGE_SET = new Set<string>(APP_LANGUAGE_VALUES);

export const normalizeAppLanguage = (language: string | null | undefined): AppLanguage => {
  if (!language) {
    return DEFAULT_APP_LANGUAGE;
  }

  if (APP_LANGUAGE_SET.has(language)) {
    return language as AppLanguage;
  }

  const normalizedLanguage = language.toLowerCase();

  if (normalizedLanguage.startsWith('zh')) {
    return 'zh-CN';
  }

  if (normalizedLanguage.startsWith('en')) {
    return 'en-US';
  }

  return DEFAULT_APP_LANGUAGE;
};
