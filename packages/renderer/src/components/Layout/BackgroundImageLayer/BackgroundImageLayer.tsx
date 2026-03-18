import React, { useEffect, useState } from 'react';
import { DEFAULT_WORKBENCH_BACKGROUND_SETTINGS, type WorkbenchBackgroundSettings } from '@note-studio/shared';
import {
  normalizeWorkbenchBackgroundSettings,
  toWorkbenchBackgroundImageUrl,
} from '../../../utils/workbenchBackground';
import './BackgroundImageLayer.scss';

interface BackgroundSettingsResponse {
  success: boolean;
  data?: WorkbenchBackgroundSettings;
  error?: string;
}

interface SettingsChangedPayload {
  key?: string | null;
  updatedKeys?: string[];
  reset?: boolean;
  imported?: boolean;
}

const BACKGROUND_SETTING_KEY = 'workbench.background';

const shouldReloadBackgroundSettings = (payload?: SettingsChangedPayload): boolean => {
  if (!payload) {
    return true;
  }

  if (payload.reset || payload.imported) {
    return true;
  }

  if (payload.key === BACKGROUND_SETTING_KEY) {
    return true;
  }

  return payload.updatedKeys?.includes(BACKGROUND_SETTING_KEY) ?? false;
};

export const BackgroundImageLayer: React.FC = () => {
  const [settings, setSettings] = useState<WorkbenchBackgroundSettings>(DEFAULT_WORKBENCH_BACKGROUND_SETTINGS);

  useEffect(() => {
    let disposed = false;

    const loadSettings = async (): Promise<void> => {
      const response = await window.electronAPI?.settings?.get(
        BACKGROUND_SETTING_KEY
      ) as BackgroundSettingsResponse | undefined;

      if (disposed) {
        return;
      }

      if (response?.success) {
        setSettings(normalizeWorkbenchBackgroundSettings(response.data));
        return;
      }

      setSettings(DEFAULT_WORKBENCH_BACKGROUND_SETTINGS);
    };

    void loadSettings();

    const unsubscribe = window.electronAPI?.on?.(
      'settings:changed',
      (payload: SettingsChangedPayload) => {
        if (shouldReloadBackgroundSettings(payload)) {
          void loadSettings();
        }
      }
    );

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const imageUrl = toWorkbenchBackgroundImageUrl(settings.imagePath);
  const isVisible = settings.enabled && imageUrl.length > 0;

  useEffect(() => {
    document.body.classList.toggle('background-image-enabled', isVisible);

    return () => {
      document.body.classList.remove('background-image-enabled');
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const blurAmount = Math.max(0, settings.blur);
  const scale = blurAmount > 0 ? 1.02 + Math.min(blurAmount / 200, 0.08) : 1;

  return (
    <div
      id="background-image-layer"
      className="background-image-layer"
      aria-hidden="true"
      style={{
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: settings.fit,
        opacity: settings.opacity,
        filter: blurAmount > 0 ? `blur(${blurAmount}px)` : 'none',
        transform: `translateZ(0) scale(${scale})`,
      }}
    />
  );
};

export default BackgroundImageLayer;
