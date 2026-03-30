/**
 * Provider that initializes renderer i18n and keeps it synchronized with settings.
 */

import React, { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { appI18n, initializeAppI18n, subscribeToAppLanguageSettings } from '../i18n';

interface AppI18nProviderProps {
  children: ReactNode;
}

export const AppI18nProvider: React.FC<AppI18nProviderProps> = ({ children }) => {
  const [isReady, setIsReady] = useState<boolean>(appI18n.isInitialized);

  useEffect(() => {
    let isMounted = true;

    void initializeAppI18n().then(() => {
      if (isMounted) {
        setIsReady(true);
      }
    });

    const unsubscribe = subscribeToAppLanguageSettings();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <I18nextProvider i18n={appI18n}>
      {children}
    </I18nextProvider>
  );
};
