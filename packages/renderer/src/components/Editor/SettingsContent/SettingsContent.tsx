/**
 * 璁剧疆鍐呭鍖哄煙缁勪欢
 * 璁剧疆鍐呭鍖猴紝鍖呭惈椤堕儴宸ュ叿鏍忓拰璁剧疆鍒楄〃
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_WORKBENCH_FILE_ICON_THEME_ID,
  DEFAULT_WORKBENCH_BACKGROUND_SETTINGS,
  type JsonValue,
  type PluginUiRuntimeSurfaceDescriptor,
  type WorkbenchBackgroundSettings,
} from '@note-studio/shared';
import { useTranslation } from 'react-i18next';
import type { SettingsCategory } from '../../Layout/Sidebar/SettingsSidebar';
import { DropdownMenu } from '@/components/common/DropdownMenu';
import { SearchInput } from '@/components/common/SearchInput';
import { EmbeddingConfig } from '@/components/EmbeddingConfig';
import { BackgroundImageSettings } from '@/components/Settings/BackgroundImageSettings/BackgroundImageSettings';
import { APP_LANGUAGE_SETTING_KEY, DEFAULT_APP_LANGUAGE } from '@/i18n';
import { workbenchContributionService } from '@/services/WorkbenchContributionService';
import { PluginSettingTabRuntimeCard } from './PluginSettingTabRuntimeCard';
import './SettingsContent.scss';

type SettingValue = JsonValue;

interface SettingOptionDefinition {
  readonly label: string;
  readonly value: SettingValue;
}

interface SettingDefinition {
  key: string;
  title: string;
  description: string;
  type: 'boolean' | 'number' | 'string' | 'select' | 'object';
  category: SettingsCategory;
  subcategory?: string;
  options?: readonly SettingOptionDefinition[];
  min?: number;
  max?: number;
  defaultValue?: SettingValue;
  extensionDisplayName?: string;
  isPluginSetting?: boolean;
}

interface PluginSettingTabSummary {
  readonly id: string;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly title: string;
  readonly preview: string | null;
  readonly previewLines: readonly string[];
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
}

interface SettingsContentProps {
  activeCategory: SettingsCategory;
  onActiveCategoryChange?: (category: SettingsCategory) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

interface SettingsChangedPayload {
  key?: string | null;
  value?: SettingValue | null;
  updatedKeys?: string[];
  reset?: boolean;
  imported?: boolean;
}

export const SettingsContent: React.FC<SettingsContentProps> = ({ 
  activeCategory, 
  onActiveCategoryChange,
  scrollContainerRef 
}) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Record<string, SettingValue>>({});
  const [pluginSettingDefinitions, setPluginSettingDefinitions] = useState<readonly SettingDefinition[]>([]);
  const [fileIconThemeOptions, setFileIconThemeOptions] = useState<readonly SettingOptionDefinition[]>([]);
  const [pluginSettingTabs, setPluginSettingTabs] = useState<readonly PluginSettingTabSummary[]>([]);
  const [jsonContent, setJsonContent] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [modifiedKeys, setModifiedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>('');
  const translateText = (key: string, defaultValue?: string): string => (
    defaultValue === undefined
      ? String(t(key))
      : String(t(key, { defaultValue }))
  );

  const syncSettingsState = (nextSettings: Record<string, SettingValue>): void => {
    const normalizedSettings = nextSettings ?? {};
    setSettings(normalizedSettings);
    setJsonContent(JSON.stringify(normalizedSettings, null, 2));
  };

  // 璁剧疆瀹氫箟锛堟牴鎹垎绫荤粍缁囷級
  const settingDefinitions: SettingDefinition[] = [
    // 甯哥敤璁剧疆
    {
      key: 'editor.fontSize',
      title: translateText('settings.definitions.editorFontSize.title'),
      description: translateText('settings.definitions.editorFontSize.description'),
      type: 'number',
      category: 'commonly-used',
      min: 8,
      max: 100,
      defaultValue: 14,
    },
    {
      key: 'editor.tabSize',
      title: translateText('settings.definitions.editorTabSize.title'),
      description: translateText('settings.definitions.editorTabSize.description'),
      type: 'number',
      category: 'commonly-used',
      min: 1,
      max: 8,
      defaultValue: 4,
    },
    {
      key: 'files.autoSave',
      title: translateText('settings.definitions.filesAutoSave.title'),
      description: translateText('settings.definitions.filesAutoSave.description'),
      type: 'select',
      category: 'commonly-used',
      options: [
        { label: translateText('settings.options.autoSave.off'), value: 'off' },
        { label: translateText('settings.options.autoSave.afterDelay'), value: 'afterDelay' },
        { label: translateText('settings.options.autoSave.onFocusChange'), value: 'onFocusChange' },
        { label: translateText('settings.options.autoSave.onWindowChange'), value: 'onWindowChange' },
      ],
      defaultValue: 'off',
    },
    {
      key: 'workbench.colorTheme',
      title: translateText('settings.definitions.workbenchColorTheme.title'),
      description: translateText('settings.definitions.workbenchColorTheme.description'),
      type: 'string',
      category: 'commonly-used',
      defaultValue: 'One Dark Pro',
    },

    // 鏂囨湰缂栬緫
    {
      key: 'editor.lineHeight',
      title: translateText('settings.definitions.editorLineHeight.title'),
      description: translateText('settings.definitions.editorLineHeight.description'),
      type: 'number',
      category: 'text-editor',
      min: 0,
      max: 100,
      defaultValue: 0,
    },
    {
      key: 'editor.insertSpaces',
      title: translateText('settings.definitions.editorInsertSpaces.title'),
      description: translateText('settings.definitions.editorInsertSpaces.description'),
      type: 'boolean',
      category: 'text-editor',
      defaultValue: true,
    },
    {
      key: 'editor.wordWrap',
      title: translateText('settings.definitions.editorWordWrap.title'),
      description: translateText('settings.definitions.editorWordWrap.description'),
      type: 'select',
      category: 'text-editor',
      options: [
        { label: translateText('settings.options.wordWrap.off'), value: 'off' },
        { label: translateText('settings.options.wordWrap.on'), value: 'on' },
        { label: translateText('settings.options.wordWrap.wordWrapColumn'), value: 'wordWrapColumn' },
        { label: translateText('settings.options.wordWrap.bounded'), value: 'bounded' },
      ],
      defaultValue: 'off',
    },
    {
      key: 'editor.minimap.enabled',
      title: translateText('settings.definitions.editorMinimapEnabled.title'),
      description: translateText('settings.definitions.editorMinimapEnabled.description'),
      type: 'boolean',
      category: 'text-editor',
      defaultValue: true,
    },
    {
      key: 'editor.lineNumbers',
      title: translateText('settings.definitions.editorLineNumbers.title'),
      description: translateText('settings.definitions.editorLineNumbers.description'),
      type: 'select',
      category: 'text-editor',
      options: [
        { label: translateText('settings.options.lineNumbers.off'), value: 'off' },
        { label: translateText('settings.options.lineNumbers.on'), value: 'on' },
        { label: translateText('settings.options.lineNumbers.relative'), value: 'relative' },
        { label: translateText('settings.options.lineNumbers.interval'), value: 'interval' },
      ],
      defaultValue: 'on',
    },

    // Workbench
    {
      key: 'workbench.sideBar.location',
      title: translateText('settings.definitions.workbenchSidebarLocation.title'),
      description: translateText('settings.definitions.workbenchSidebarLocation.description'),
      type: 'select',
      category: 'workbench',
      options: [
        { label: translateText('settings.options.sidebarLocation.left'), value: 'left' },
        { label: translateText('settings.options.sidebarLocation.right'), value: 'right' },
      ],
      defaultValue: 'left',
    },
    {
      key: 'workbench.activityBar.visible',
      title: translateText('settings.definitions.workbenchActivityBarVisible.title'),
      description: translateText('settings.definitions.workbenchActivityBarVisible.description'),
      type: 'boolean',
      category: 'workbench',
      defaultValue: true,
    },

    // 绐楀彛
    {
      key: 'workbench.background',
      title: translateText('settings.definitions.workbenchBackground.title'),
      description: translateText('settings.definitions.workbenchBackground.description'),
      type: 'object',
      category: 'workbench',
      defaultValue: {
        enabled: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.enabled,
        imagePath: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.imagePath,
        opacity: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.opacity,
        blur: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.blur,
        fit: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.fit,
      },
    },
    {
      key: 'workbench.fileIconTheme',
      title: translateText('settings.definitions.workbenchFileIconTheme.title', 'File Icon Theme'),
      description: translateText(
        'settings.definitions.workbenchFileIconTheme.description',
        'Choose which plugin-provided file icon theme is used in file trees.',
      ),
      type: 'select',
      category: 'workbench',
      options: fileIconThemeOptions.length > 0
        ? fileIconThemeOptions
        : [{ label: 'Material File Icons', value: DEFAULT_WORKBENCH_FILE_ICON_THEME_ID }],
      defaultValue: DEFAULT_WORKBENCH_FILE_ICON_THEME_ID,
    },

    {
      key: 'window.zoomLevel',
      title: translateText('settings.definitions.windowZoomLevel.title'),
      description: translateText('settings.definitions.windowZoomLevel.description'),
      type: 'number',
      category: 'window',
      min: -5,
      max: 5,
      defaultValue: 0,
    },
    {
      key: 'window.title',
      title: translateText('settings.definitions.windowTitle.title'),
      description: translateText('settings.definitions.windowTitle.description'),
      type: 'string',
      category: 'window',
      defaultValue: '${activeEditorShort}${separator}${rootName}',
    },

    // AI
    {
      key: 'files.encoding',
      title: translateText('settings.definitions.filesEncoding.title'),
      description: translateText('settings.definitions.filesEncoding.description'),
      type: 'select',
      category: 'ai',
      options: [
        { label: translateText('settings.options.filesEncoding.utf8'), value: 'utf8' },
        { label: translateText('settings.options.filesEncoding.utf8bom'), value: 'utf8bom' },
        { label: translateText('settings.options.filesEncoding.utf16le'), value: 'utf16le' },
        { label: translateText('settings.options.filesEncoding.utf16be'), value: 'utf16be' },
        { label: translateText('settings.options.filesEncoding.gbk'), value: 'gbk' },
      ],
      defaultValue: 'utf8',
    },
    {
      key: 'search.useIgnoreFiles',
      title: translateText('settings.definitions.searchUseIgnoreFiles.title'),
      description: translateText('settings.definitions.searchUseIgnoreFiles.description'),
      type: 'boolean',
      category: 'ai',
      defaultValue: true,
    },
    // Embedding 閰嶇疆锛堢壒娈婂鐞嗭紝浣跨敤鑷畾涔夌粍浠讹級
    {
      key: 'embedding.config',
      title: translateText('settings.definitions.embeddingConfig.title'),
      description: translateText('settings.definitions.embeddingConfig.description'),
      type: 'object',
      category: 'ai',
    },
    {
      key: APP_LANGUAGE_SETTING_KEY,
      title: translateText('settings.definitions.applicationLanguage.title'),
      description: translateText('settings.definitions.applicationLanguage.description'),
      type: 'select',
      category: 'application',
      options: [
        { label: translateText('settings.options.appLanguage.zhCN'), value: 'zh-CN' },
        { label: translateText('settings.options.appLanguage.enUS'), value: 'en-US' },
      ],
      defaultValue: DEFAULT_APP_LANGUAGE,
    },
  ];

  // 鍔犺浇璁剧疆
  const allSettingDefinitions = [...settingDefinitions, ...pluginSettingDefinitions];

  const serializeSelectValue = (value: SettingValue): string => JSON.stringify(value);

  const resolveSelectOptionValue = (
    def: SettingDefinition,
    serializedValue: string,
  ): SettingValue | null => {
    const matchedOption = def.options?.find(option =>
      serializeSelectValue(option.value) === serializedValue,
    );
    return matchedOption?.value ?? null;
  };

  const resolveBackgroundSettingsValue = (value: SettingValue | undefined): WorkbenchBackgroundSettings => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return DEFAULT_WORKBENCH_BACKGROUND_SETTINGS;
    }

    const candidate = value as Record<string, SettingValue>;
    if (
      typeof candidate.enabled !== 'boolean'
      || typeof candidate.imagePath !== 'string'
      || typeof candidate.opacity !== 'number'
      || typeof candidate.blur !== 'number'
      || typeof candidate.fit !== 'string'
    ) {
      return DEFAULT_WORKBENCH_BACKGROUND_SETTINGS;
    }

    return {
      enabled: candidate.enabled,
      imagePath: candidate.imagePath,
      opacity: candidate.opacity,
      blur: candidate.blur,
      fit: candidate.fit as WorkbenchBackgroundSettings['fit'],
    };
  };

  useEffect(() => {
    void loadSettings();
    void loadPluginSettings();
    void loadPluginSettingTabs();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await window.electronAPI?.settings?.getAll();
      if (result?.success) {
        syncSettingsState((result.data as Record<string, SettingValue> | undefined) ?? {});
      }
    } catch (error) {
      console.error('鍔犺浇璁剧疆澶辫触:', error);
      setError(translateText('settings.errors.loadSettings'));
    }
  };

  const loadPluginSettings = async (): Promise<void> => {
    try {
      const snapshot = await workbenchContributionService.getContributions();
      setFileIconThemeOptions(
        snapshot.fileIconThemes.map(theme => ({
          label: theme.label,
          value: theme.id,
        })),
      );
      setPluginSettingDefinitions(
        snapshot.settings.map(setting => ({
          key: setting.key,
          title: setting.title,
          description: setting.description,
          type: setting.type,
          category: 'application',
          options: setting.options,
          defaultValue: setting.defaultValue,
          extensionDisplayName: setting.extensionDisplayName,
          isPluginSetting: true,
        })),
      );
    } catch (error) {
      console.error('鍔犺浇鎻掍欢璁剧疆瀹氫箟澶辫触:', error);
      setFileIconThemeOptions([]);
      setPluginSettingDefinitions([]);
    }
  };

  const loadPluginSettingTabs = async (): Promise<void> => {
    try {
      const tabs = (
        await window.electron?.ipcRenderer.invoke('plugin-ui:get-setting-tabs')
      ) as readonly PluginSettingTabSummary[] | undefined;
      setPluginSettingTabs(tabs ?? []);
    } catch (error) {
      console.error('鍔犺浇鎻掍欢璁剧疆 tab 澶辫触:', error);
      setPluginSettingTabs([]);
    }
  };

  // 鐩戝惉璁剧疆鍙樺寲
  useEffect(() => {
    const handleSettingsChanged = (payload: SettingsChangedPayload) => {
      if (payload.reset || payload.imported || (payload.updatedKeys?.length ?? 0) > 0) {
        void loadSettings();
        void loadPluginSettingTabs();
        return;
      }

      const changedKey = payload.key;

      if (typeof changedKey === 'string' && changedKey.startsWith('plugin.data.')) {
        void loadPluginSettingTabs();
      }

      if (typeof changedKey === 'string' && payload.value !== undefined) {
        setSettings(previousSettings => {
          const nextSettings = {
            ...previousSettings,
            [changedKey]: payload.value as SettingValue,
          };
          setJsonContent(JSON.stringify(nextSettings, null, 2));
          return nextSettings;
        });
        return;
      }

      void loadSettings();
    };

    const unsubscribe = window.electronAPI?.on?.('settings:changed', handleSettingsChanged);
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.electron?.ipcRenderer.on(
      'plugin-ui:entries-changed',
      () => {
        void loadPluginSettings();
        void loadPluginSettingTabs();
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, []);

  // 鏇存柊璁剧疆
  const updateSetting = async (key: string, value: SettingValue) => {
    try {
      const result = await window.electronAPI?.settings?.update(key, value);
      if (result?.success) {
        setSettings(prev => ({ ...(prev ?? {}), [key]: value }));
        setModifiedKeys(prev => new Set([...prev, key]));
      } else {
        setError(typeof result?.error === 'string' ? result.error : translateText('settings.errors.updateSetting'));
      }
    } catch (error) {
      console.error('鏇存柊璁剧疆澶辫触:', error);
      setError(translateText('settings.errors.updateSetting'));
    }
  };


  // 閲嶇疆璁剧疆
  const handleReset = async (key?: string) => {
    try {
      const result = await window.electronAPI?.settings?.reset(key);
      if (result?.success) {
        await loadSettings();
        if (key) {
          setModifiedKeys(prev => {
            const newSet = new Set(prev);
            newSet.delete(key);
            return newSet;
          });
        } else {
          setModifiedKeys(new Set());
        }
      }
    } catch (error) {
      console.error('閲嶇疆璁剧疆澶辫触:', error);
      setError(translateText('settings.errors.resetSetting'));
    }
  };

  // 鏍规嵁鍒嗙被杩囨护璁剧疆
  const getCategorySettings = useCallback((category: SettingsCategory) => {
    return allSettingDefinitions.filter(def => {
      // 鏍规嵁鍒嗙被杩囨护
      if (def.category !== category) return false;
      
      // 鏍规嵁鎼滅储杩囨护
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          def.title.toLowerCase().includes(query) ||
          def.description.toLowerCase().includes(query) ||
          def.key.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [allSettingDefinitions, searchQuery]);

  // All categories
  const allCategories: SettingsCategory[] = [
    'commonly-used',
    'text-editor', 
    'workbench',
    'window',
    'ai',
    'shortcuts',
    'cloud-backup',
    'cloud-backup-local',
    'cloud-backup-webdav',
    'cloud-backup-jianguoyun',
    'cloud-backup-gitee',
    'cloud-backup-custom',
    'data-settings',
    'data-settings-notion',
    'data-settings-yuque',
    'data-settings-joplin',
    'data-settings-obsidian',
    'data-settings-siyuan',
    'data-settings-custom',
    'document-processing',
    'plugins',
    'application'
  ];

  const categoryLabels: Record<SettingsCategory, string> = {
    'commonly-used': translateText('settings.categories.commonlyUsed'),
    'text-editor': translateText('settings.categories.textEditor'),
    'workbench': translateText('settings.categories.workbench'),
    'window': translateText('settings.categories.window'),
    'ai': translateText('settings.categories.ai'),
    'shortcuts': translateText('settings.categories.shortcuts'),
    'cloud-backup': translateText('settings.categories.cloudBackup'),
    'cloud-backup-local': translateText('settings.categories.cloudBackupLocal'),
    'cloud-backup-webdav': translateText('settings.categories.cloudBackupWebdav'),
    'cloud-backup-jianguoyun': translateText('settings.categories.cloudBackupJianguoyun'),
    'cloud-backup-gitee': translateText('settings.categories.cloudBackupGitee'),
    'cloud-backup-custom': translateText('settings.categories.cloudBackupCustom'),
    'data-settings': translateText('settings.categories.dataSettings'),
    'data-settings-notion': translateText('settings.categories.dataSettingsNotion'),
    'data-settings-yuque': translateText('settings.categories.dataSettingsYuque'),
    'data-settings-joplin': translateText('settings.categories.dataSettingsJoplin'),
    'data-settings-obsidian': translateText('settings.categories.dataSettingsObsidian'),
    'data-settings-siyuan': translateText('settings.categories.dataSettingsSiyuan'),
    'data-settings-custom': translateText('settings.categories.dataSettingsCustom'),
    'document-processing': translateText('settings.categories.documentProcessing'),
    'plugins': '鎻掍欢',
    'application': translateText('settings.categories.application'),
  };

  // 浣跨敤 IntersectionObserver 鐩戝惉婊氬姩骞惰嚜鍔ㄩ€変腑瀵瑰簲鍒嗙被
  useEffect(() => {
    if (!scrollContainerRef?.current || !onActiveCategoryChange) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the top-most visible category
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Choose the category closest to the viewport top
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const topEntry = visibleEntries[0];
          const categoryId = topEntry.target.id.replace('category-', '') as SettingsCategory;
          onActiveCategoryChange(categoryId);
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '-20% 0px -70% 0px', // Activate when category enters the upper viewport
        threshold: 0
      }
    );

    // Observe all category sections
    const categoryElements = scrollContainerRef.current.querySelectorAll('[id^="category-"]');
    categoryElements.forEach(element => observer.observe(element));

    return () => {
      categoryElements.forEach(element => observer.unobserve(element));
      observer.disconnect();
    };
  }, [scrollContainerRef, onActiveCategoryChange]);

  // 娓叉煋璁剧疆鎺т欢
  const renderSettingControl = (def: SettingDefinition) => {
    const value = (settings ?? {})[def.key] ?? def.defaultValue;

    switch (def.type) {
      case 'boolean':
        return (
          <label>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => updateSetting(def.key, e.target.checked)}
              className="control-checkbox"
            />
          </label>
        );

      case 'number':
        return (
          <input
            type="number"
            value={typeof value === 'number' ? value : Number(def.defaultValue ?? 0)}
            min={def.min}
            max={def.max}
            onChange={(e) => updateSetting(def.key, Number(e.target.value))}
            className="control-input"
          />
        );

      case 'string':
        return (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => updateSetting(def.key, e.target.value)}
            className="control-input"
          />
        );

      case 'select':
        return (
          <DropdownMenu
            value={serializeSelectValue(value ?? def.defaultValue ?? '')}
            onChange={(newValue: string) => {
              const nextValue = resolveSelectOptionValue(def, newValue);
              if (nextValue !== null) {
                void updateSetting(def.key, nextValue);
              }
            }}
            items={def.options?.map(option => ({
              value: serializeSelectValue(option.value),
              label: option.label,
            })) || []}
          />
        );

      case 'object':
        // Embedding config uses a dedicated component
        if (def.key === 'embedding.config') {
          return <EmbeddingConfig />;
        }
        if (def.key === 'workbench.background') {
          return (
            <BackgroundImageSettings
              value={resolveBackgroundSettingsValue(value)}
              onChange={(nextValue) => updateSetting(def.key, {
                enabled: nextValue.enabled,
                imagePath: nextValue.imagePath,
                opacity: nextValue.opacity,
                blur: nextValue.blur,
                fit: nextValue.fit,
              })}
            />
          );
        }
        return null;

      default:
        return null;
    }
  };

  // Render main view
  return (
    <div className="settings-content">
      {/* Toolbar */}
      <div className="settings-toolbar">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={translateText('settings.toolbar.searchPlaceholder')}
          alwaysExpanded={true}
          expandedWidth="100%"
        />
      </div>

      {/* 鍐呭鍖哄煙 */}
      <div className="content-area">
        {/* UI 妯″紡 - 鏄剧ず鎵€鏈夊垎绫?*/}
        <div className="content-scroll" ref={scrollContainerRef}>
            <div className="content-inner">
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              {/* 閬嶅巻鎵€鏈夊垎绫诲苟鏄剧ず */}
              {allCategories.map((category) => {
                const categorySettings = getCategorySettings(category);

                if (category === 'plugins') {
                  const filteredPluginTabs = pluginSettingTabs.filter((tab) => {
                    if (searchQuery.trim().length === 0) {
                      return true;
                    }

                    const normalizedQuery = searchQuery.trim().toLowerCase();
                    return [
                      tab.title,
                      tab.pluginName,
                      tab.pluginId,
                      tab.preview ?? '',
                      tab.previewLines.join(' '),
                    ].some((value) => value.toLowerCase().includes(normalizedQuery));
                  });

                  if (filteredPluginTabs.length === 0) return null;

                  return (
                    <div key={category} id={`category-${category}`} className="category-section">
                      <h2 className="category-title">{categoryLabels[category]}</h2>
                      <div className="settings-list">
                        {filteredPluginTabs.map((tab) => (
                          <PluginSettingTabRuntimeCard key={tab.id} tab={tab} />
                        ))}
                      </div>
                    </div>
                  );
                }

                if (categorySettings.length === 0) return null;

                return (
                  <div key={category} id={`category-${category}`} className="category-section">
                    <h2 className="category-title">{categoryLabels[category]}</h2>
                    <div className="settings-list">
                      {categorySettings.map((def) => {
                        const isModified = modifiedKeys.has(def.key);
                        
                        // Object settings use full-width custom controls
                        if (def.type === 'object') {
                          return (
                            <div key={def.key} className="setting-item setting-item--full">
                              {renderSettingControl(def)}
                            </div>
                          );
                        }
                        
                        return (
                          <div key={def.key} className="setting-item">
                            <div className="setting-row">
                              <div className="setting-info">
                                <div className="setting-header">
                                  <h3 className="setting-title">{def.title}</h3>
                                  {def.isPluginSetting && def.extensionDisplayName && (
                                    <span className="setting-source-badge">{def.extensionDisplayName}</span>
                                  )}
                                  {isModified && (
                                    <span className="modified-badge">{translateText('settings.status.modified')}</span>
                                  )}
                                </div>
                                <p className="setting-description">{def.description}</p>
                                <code className="setting-key">{def.key}</code>
                              </div>
                              <div className="setting-controls">
                                {renderSettingControl(def)}
                                {isModified && (
                                  <div
                                    onClick={() => handleReset(def.key)}
                                    className="reset-action"
                                    title={translateText('settings.status.resetTitle')}
                                  >
                                    {translateText('settings.status.reset')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* 椤佃剼 */}
              <footer className="settings-footer">
                <div className="settings-footer__content">
                  <div className="settings-footer__brand">
                    <span className="settings-footer__name">Note WStudio</span>
                    <span className="settings-footer__version">v1.0.0</span>
                  </div>
                  <div className="settings-footer__slogan">
                    {translateText('settings.footer.slogan')}
                  </div>
                  <div className="settings-footer__links">
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://github.com')}>GitHub</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/docs')}>{translateText('settings.footer.terms')}</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/privacy')}>{translateText('settings.footer.privacy')}</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/feedback')}>{translateText('settings.footer.feedback')}</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/changelog')}>{translateText('settings.footer.contact')}</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com')}>{translateText('settings.footer.website')}</span>
                  </div>
                  <div className="settings-footer__copyright">
                    {translateText('settings.footer.copyright')}
                  </div>
                  <div className="settings-footer__icp">
                    {translateText('settings.footer.icp')}
                  </div>
                </div>
              </footer>
            </div>
          </div>
      </div>
    </div>
  );
};


