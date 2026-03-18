/**
 * Status bar with editor state and indexing progress.
 */

import React, { useEffect, useState } from 'react';
import './StatusBar.scss';
import { Icon } from '../../Icons/Icon';
import { useActivityBarStore } from '../../../stores/activityBarStore';
import type { SettingsCategory } from '../Sidebar/SettingsSidebar';

interface StatusBarProps {}

interface ActiveTabChangeDetail {
  tabType: string | null;
  language?: string;
}

interface LanguageChangeDetail {
  language: string;
}

interface ContentChangeDetail {
  content?: string;
}

interface VectorizationProgress {
  status: 'idle' | 'running' | 'completed';
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
}

interface VectorIndexingProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
  status: 'idle' | 'scanning' | 'indexing' | 'paused' | 'completed' | 'error';
  workspaceTotalFiles?: number;
  indexedTotalFiles?: number;
  vectorization?: VectorizationProgress;
}

interface OpenSettingsDetail {
  category?: SettingsCategory;
}

const LANGUAGE_LABELS: Record<string, string> = {
  markdown: 'Markdown',
  json: 'JSON',
  jsonc: 'JSON with Comments',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  css: 'CSS',
  html: 'HTML',
  plaintext: 'Plain Text',
};

const getLanguageLabel = (language: string): string => {
  return LANGUAGE_LABELS[language] || language.toUpperCase();
};

const getWordCount = (content: string): number => {
  return content.replace(/\s+/g, '').length;
};

export const StatusBar: React.FC<StatusBarProps> = () => {
  const { sidebarPosition } = useActivityBarStore();
  const [wordCount, setWordCount] = useState<number>(0);
  const [currentLanguage, setCurrentLanguage] = useState<string>('Markdown');
  const [currentTabType, setCurrentTabType] = useState<string | null>('file');
  const [vectorIndexingProgress, setVectorIndexingProgress] = useState<VectorIndexingProgress | null>(null);

  useEffect(() => {
    const handleTabLanguageChange = (event: Event): void => {
      const customEvent = event as CustomEvent<LanguageChangeDetail>;
      if (customEvent.detail?.language) {
        setCurrentLanguage(getLanguageLabel(customEvent.detail.language));
      }
    };

    window.addEventListener('tab:language-changed', handleTabLanguageChange);
    return () => {
      window.removeEventListener('tab:language-changed', handleTabLanguageChange);
    };
  }, []);

  useEffect(() => {
    const handleContentChanged = (event: Event): void => {
      const customEvent = event as CustomEvent<ContentChangeDetail>;
      const content = typeof customEvent.detail?.content === 'string' ? customEvent.detail.content : '';
      setWordCount(getWordCount(content));
    };

    window.addEventListener('editor:content-changed', handleContentChanged);
    return () => {
      window.removeEventListener('editor:content-changed', handleContentChanged);
    };
  }, []);

  useEffect(() => {
    const handleActiveTabChanged = (event: Event): void => {
      const customEvent = event as CustomEvent<ActiveTabChangeDetail>;
      const tabType = customEvent.detail?.tabType ?? null;
      const language = customEvent.detail?.language;

      React.startTransition(() => {
        setCurrentTabType(tabType);
        if (tabType !== 'file') {
          setWordCount(0);
        }
        if (language) {
          setCurrentLanguage(getLanguageLabel(language));
        }
      });
    };

    window.addEventListener('editor:active-tab-changed', handleActiveTabChanged);
    return () => {
      window.removeEventListener('editor:active-tab-changed', handleActiveTabChanged);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.electron?.workspaceVectorIndex?.onProgress?.(
      (progress: VectorIndexingProgress) => {
        setVectorIndexingProgress(progress);
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const OutlineIcon = (): React.ReactElement => (
    <div className="status-bar-info-btn status-bar-info-btn--icon" title="大纲">
      <svg
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
      >
        <path d="M10 5h11" />
        <path d="M10 12h11" />
        <path d="M10 19h11" />
        <path d="m3 10 3-3-3-3" />
        <path d="m3 20 3-3-3-3" />
      </svg>
    </div>
  );

  const leftProgressVisible = vectorIndexingProgress
    && (vectorIndexingProgress.status === 'scanning' || vectorIndexingProgress.status === 'indexing');

  const vectorizationVisible = vectorIndexingProgress?.vectorization?.status === 'running';

  const handleOpenBackgroundSettings = (): void => {
    window.dispatchEvent(new CustomEvent<OpenSettingsDetail>('open-settings', {
      detail: { category: 'workbench' },
    }));
  };

  return (
    <div className="status-bar">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          height: '100%',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {leftProgressVisible && vectorIndexingProgress && (
          <div
            className="status-bar-indexing"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title={vectorIndexingProgress.currentFile || '正在索引工作区文件...'}
          >
            <Icon
              name="sync"
              size={12}
              style={{
                animation: 'spin 1s linear infinite',
                display: 'inline-flex',
                opacity: 0.8,
              }}
            />
            <span className="status-bar-text" style={{ fontSize: '11px', opacity: 0.9 }}>
              {vectorIndexingProgress.status === 'scanning' ? 'Scanning' : 'Indexing'}
            </span>
            <div
              style={{
                width: '60px',
                height: '4px',
                backgroundColor: 'var(--ws-input-background, rgba(255,255,255,0.1))',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: vectorIndexingProgress.totalFiles > 0
                    ? `${(vectorIndexingProgress.processedFiles / vectorIndexingProgress.totalFiles) * 100}%`
                    : '0%',
                  height: '100%',
                  backgroundColor: 'var(--ws-button-background, #0e639c)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span className="status-bar-text" style={{ fontSize: '10px', opacity: 0.7 }}>
              {vectorIndexingProgress.processedFiles}/{vectorIndexingProgress.totalFiles}
            </span>
          </div>
        )}

        {vectorizationVisible && vectorIndexingProgress?.vectorization && (
          <div
            className="status-bar-indexing"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title={vectorIndexingProgress.vectorization.currentFile || '正在向量化...'}
          >
            <Icon
              name="sync"
              size={12}
              style={{
                animation: 'spin 2s linear infinite',
                display: 'inline-flex',
                opacity: 0.6,
              }}
            />
            <span className="status-bar-text" style={{ fontSize: '11px', opacity: 0.8 }}>
              向量化
            </span>
            <div
              style={{
                width: '50px',
                height: '4px',
                backgroundColor: 'var(--ws-input-background, rgba(255,255,255,0.1))',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: vectorIndexingProgress.vectorization.totalFiles > 0
                    ? `${(
                      vectorIndexingProgress.vectorization.processedFiles
                      / vectorIndexingProgress.vectorization.totalFiles
                    ) * 100}%`
                    : '0%',
                  height: '100%',
                  backgroundColor: 'var(--ws-statusbar-vectorizing, #4ec9b0)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span className="status-bar-text" style={{ fontSize: '10px', opacity: 0.6 }}>
              {vectorIndexingProgress.vectorization.processedFiles}/{vectorIndexingProgress.vectorization.totalFiles}
            </span>
          </div>
        )}
      </div>

      <div className="status-bar-right">
        {currentTabType === 'file' && (
          <>
            <div className="status-bar-info-btn">字数统计： {wordCount}</div>
            <div className="status-bar-info-btn">{currentLanguage}</div>
            <div className="status-bar-divider" aria-hidden="true" />
          </>
        )}

        <div className="status-bar-right-icons">
          {sidebarPosition === 'right' && <OutlineIcon />}

          <div
            className="status-bar-info-btn status-bar-info-btn--icon status-bar-info-btn--action"
            title="Background image"
            onClick={handleOpenBackgroundSettings}
          >
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="m21 16-5.5-5.5L8 18" />
            </svg>
          </div>

          <div className="status-bar-info-btn status-bar-info-btn--icon" title="通知中心">
            <Icon name="notification" iconSet="ui" size={14} />
          </div>

          <div className="status-bar-info-btn status-bar-info-btn--icon" title="反馈">
            <svg
              width="14"
              height="14"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
