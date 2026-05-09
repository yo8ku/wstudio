/**
 * Default editor landing view shown when no tabs are open.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PressableControl } from '../../../common/PressableControl/PressableControl';
import { CloseIcon } from '../../../Icons/CloseIcon';
import { toastService } from '../../../../services/ToastService';
import './DefaultEditorTabView.scss';

interface RecentFileEntry {
  readonly path: string;
  readonly name: string;
  readonly locationText: string;
}

interface EditorQuickAction {
  readonly id: string;
  readonly label: string;
  readonly shortcut: string;
  readonly icon?: React.ReactNode;
  readonly onPress: () => void;
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/');

const getFileName = (filePath: string): string => {
  const normalizedPath = normalizePath(filePath);
  const segments = normalizedPath.split('/').filter(Boolean);
  return segments[segments.length - 1] || filePath;
};

const getLocationText = (filePath: string): string => {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    return '';
  }

  const lastSeparatorIndex = Math.max(normalizedPath.lastIndexOf('\\'), normalizedPath.lastIndexOf('/'));
  if (lastSeparatorIndex <= 0) {
    return normalizedPath;
  }

  return normalizedPath.slice(0, lastSeparatorIndex);
};

const toRecentFileEntry = (filePath: string): RecentFileEntry | null => {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    return null;
  }

  return {
    path: normalizedPath,
    name: getFileName(normalizedPath),
    locationText: getLocationText(normalizedPath),
  };
};

export const DefaultEditorTabView: React.FC = () => {
  const { t } = useTranslation();
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [hasLoadedRecentFiles, setHasLoadedRecentFiles] = useState(false);
  const translateText = useCallback(
    (key: string, defaultValue: string): string => String(t(key, { defaultValue })),
    [t],
  );

  const handleNewFile = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('open-file', {
      detail: {
        path: '',
        content: '',
        name: 'Untitled',
        language: 'markdown',
        isPreview: false,
      },
    }));
  }, []);

  const handleOpenFile = useCallback((): void => {
    window.dispatchEvent(new Event('open-file'));
  }, []);

  const handleOpenFolder = useCallback(async (): Promise<void> => {
    try {
      const result = await window.electron?.folder?.open();
      if (result?.success && result.data?.path) {
        window.dispatchEvent(new CustomEvent('folder-opened', {
          detail: { path: result.data.path },
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '打开文件夹失败';
      toastService.error(message);
    }
  }, []);

  const handleOpenRecentFile = useCallback(async (filePath: string): Promise<void> => {
    try {
      const result = await window.electron?.file?.read(filePath);
      if (!result?.success || !result.data?.path) {
        toastService.error(result?.error || '打开最近记录失败');
        return;
      }

      window.dispatchEvent(new CustomEvent('open-file', {
        detail: {
          path: result.data.path,
          content: result.data.content,
          name: result.data.name,
          language: result.data.language,
          activateIfExists: true,
          isPreview: false,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '打开最近记录失败';
      toastService.error(message);
    }
  }, []);

  const handleRemoveRecentFile = useCallback(async (filePath: string): Promise<void> => {
    try {
      const result = await window.electron?.workspace?.removeRecentFile(filePath);
      if (!result?.success) {
        toastService.error(result?.error || '移除最近记录失败');
        return;
      }

      setRecentFiles((previous) => previous.filter((recentFile) => recentFile.path !== filePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : '移除最近记录失败';
      toastService.error(message);
    }
  }, []);

  useEffect(() => {
    let isDisposed = false;

    const loadRecentFiles = async (): Promise<void> => {
      try {
        const response = await window.electron?.workspace?.getRecentFiles();
        if (isDisposed) {
          return;
        }

        const nextRecentFiles = (response?.success && Array.isArray(response.data) ? response.data : [])
          .map(toRecentFileEntry)
          .filter((entry): entry is RecentFileEntry => entry !== null)
          .slice(0, 5);

        setRecentFiles(nextRecentFiles);
      } catch (error) {
        if (!isDisposed) {
          setRecentFiles([]);
        }
      } finally {
        if (!isDisposed) {
          setHasLoadedRecentFiles(true);
        }
      }
    };

    void loadRecentFiles();

    return () => {
      isDisposed = true;
    };
  }, []);

  const quickActions = useMemo<EditorQuickAction[]>(() => [
    {
      id: 'new-file',
      label: translateText('editorArea.defaultTab.actions.newFile', '新建文件'),
      shortcut: '（Ctrl + N）',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M13.81 22H6c-1.11 0-2-.89-2-2V4a2 2 0 0 1 2-2h8l6 6v5.09c-.33-.05-.66-.09-1-.09s-.67.04-1 .09V9h-5V4H6v16h7.09c.12.72.37 1.39.72 2M23 18h-3v-3h-2v3h-3v2h3v3h2v-3h3z"/>
        </svg>
      ),
      onPress: handleNewFile,
    },
    {
      id: 'open-file',
      label: translateText('editorArea.defaultTab.actions.openFile', '打开文件'),
      shortcut: '（Ctrl + O）',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M4 21v-4a3 3 0 0 1 3-3h5"/>
            <path d="m9 17l3-3l-3-3m5-8v4a1 1 0 0 0 1 1h4"/>
            <path d="M5 11V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7.5"/>
          </g>
        </svg>
      ),
      onPress: handleOpenFile,
    },
    {
      id: 'open-folder',
      label: translateText('editorArea.defaultTab.actions.importRepository', '导入仓库'),
      shortcut: '（Ctrl + L）',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h6l2 2h8q.825 0 1.413.588T22 8H11.175l-2-2H4v12l2.4-8h17.1l-2.575 8.575q-.2.65-.737 1.038T19 20zm2.1-2H19l1.8-6H7.9zm0 0l1.8-6zM4 8V6z"/>
        </svg>
      ),
      onPress: () => {
        void handleOpenFolder();
      },
    },
  ], [handleNewFile, handleOpenFile, handleOpenFolder, translateText]);

  return (
    <div className="default-editor-tab-view">
      <div className="default-editor-tab-view__content">
        <h1 className="default-editor-tab-view__title">
          {translateText('editorArea.defaultTab.title', 'WStudio')}
        </h1>

        <section className="default-editor-tab-view__section">
          <h3 className="default-editor-tab-view__section-title">
            {translateText('editorArea.defaultTab.actions.title', '启动')}
          </h3>
          <ul className="default-editor-tab-view__link-list default-editor-tab-view__link-list--actions">
            {quickActions.map((action) => (
              <li key={action.id} className="default-editor-tab-view__link-item">
                <PressableControl className="default-editor-tab-view__link" onPress={action.onPress}>
                  {action.icon ? <span className="default-editor-tab-view__link-icon">{action.icon}</span> : null}
                  <span className="default-editor-tab-view__link-label">{`${action.label}${action.shortcut}`}</span>
                </PressableControl>
              </li>
            ))}
          </ul>
        </section>

        <section className="default-editor-tab-view__section">
          <h3 className="default-editor-tab-view__section-title">
            {translateText('editorArea.defaultTab.recent.title', '最近')}
          </h3>

          {recentFiles.length > 0 ? (
            <ul className="default-editor-tab-view__link-list">
              {recentFiles.map((recentFile) => (
                <li
                  key={recentFile.path}
                  className="default-editor-tab-view__link-item default-editor-tab-view__link-item--recent"
                >
                  <PressableControl
                    className="default-editor-tab-view__link default-editor-tab-view__link--recent"
                    onPress={() => {
                      void handleOpenRecentFile(recentFile.path);
                    }}
                  >
                    <span className="default-editor-tab-view__recent-name">{recentFile.name}</span>
                    <span className="default-editor-tab-view__recent-location">{recentFile.locationText}</span>
                  </PressableControl>
                  <PressableControl
                    className="default-editor-tab-view__recent-remove"
                    aria-label={translateText('editorArea.defaultTab.recent.remove', '从最近打开中删除')}
                    title={translateText('editorArea.defaultTab.recent.remove', '从最近打开中删除')}
                    onPress={(event) => {
                      event.stopPropagation();
                      void handleRemoveRecentFile(recentFile.path);
                    }}
                  >
                    <CloseIcon size={12} />
                  </PressableControl>
                </li>
              ))}
            </ul>
          ) : hasLoadedRecentFiles ? (
            <div className="default-editor-tab-view__empty-text">
              <span>{translateText('editorArea.defaultTab.recent.emptyPrefix', '你没有最近使用的仓库，')}</span>
              <PressableControl
                className="default-editor-tab-view__inline-link"
                onPress={() => {
                  void handleOpenFolder();
                }}
              >
                {translateText('editorArea.defaultTab.recent.openFolder', '“打开文件夹”')}
              </PressableControl>
              <span>{translateText('editorArea.defaultTab.recent.emptySuffix', '以开始')}</span>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default DefaultEditorTabView;
