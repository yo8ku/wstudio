import React, { useEffect } from 'react';
import {
  DEFAULT_WORKBENCH_FILE_ICON_THEME_ID,
  type JsonValue,
  type WorkbenchFileIconThemeEntry,
} from '@note-studio/shared';
import {
  setActiveWorkspaceFileIconThemeId,
  setWorkspaceFileIconThemes,
} from '../../services/workspaceFileIconThemeState';

interface WorkspaceFileIconThemeBootstrapProps {
  readonly themes: readonly WorkbenchFileIconThemeEntry[];
}

interface SettingsChangedPayload {
  readonly key?: string | null;
  readonly value?: JsonValue | null;
  readonly updatedKeys?: readonly string[];
  readonly reset?: boolean;
  readonly imported?: boolean;
}

interface SettingsGetResponse {
  readonly data?: JsonValue;
}

function resolveActiveThemeId(value: JsonValue | null | undefined): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : DEFAULT_WORKBENCH_FILE_ICON_THEME_ID;
}

export const WorkspaceFileIconThemeBootstrap: React.FC<WorkspaceFileIconThemeBootstrapProps> = ({
  themes,
}) => {
  useEffect(() => {
    setWorkspaceFileIconThemes(themes);
  }, [themes]);

  useEffect(() => {
    let disposed = false;

    const syncActiveTheme = async (): Promise<void> => {
      const response = await window.electronAPI?.settings?.get('workbench.fileIconTheme') as
        | SettingsGetResponse
        | undefined;

      if (disposed) {
        return;
      }

      setActiveWorkspaceFileIconThemeId(resolveActiveThemeId(response?.data ?? null));
    };

    void syncActiveTheme();

    const unsubscribe = window.electronAPI?.on?.(
      'settings:changed',
      (payload?: SettingsChangedPayload) => {
        if (!payload) {
          return;
        }

        if (payload.key === 'workbench.fileIconTheme') {
          setActiveWorkspaceFileIconThemeId(resolveActiveThemeId(payload.value ?? null));
          return;
        }

        if (
          payload.reset
          || payload.imported
          || (payload.updatedKeys ?? []).includes('workbench.fileIconTheme')
        ) {
          void syncActiveTheme();
        }
      },
    );

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  return null;
};

export default WorkspaceFileIconThemeBootstrap;
