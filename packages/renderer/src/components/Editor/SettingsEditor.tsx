/**
 * 设置编辑器组件
 * 类似 VS Code 的设置界面，支持 UI 和 JSON 两种模式
 */

import React, { useState, useEffect, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useTheme } from '../../contexts/ThemeContext';
import { CustomSelect } from '../common/CustomSelect';

interface SettingDefinition {
  key: string;
  title: string;
  description: string;
  type: 'boolean' | 'number' | 'string' | 'select' | 'object';
  category: string;
  options?: string[];
  min?: number;
  max?: number;
  default?: any;
}

interface SettingsEditorProps {
  onClose?: () => void;
}

export const SettingsEditor: React.FC<SettingsEditorProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const [mode, setMode] = useState<'ui' | 'json'>('ui');
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [jsonContent, setJsonContent] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [modifiedKeys, setModifiedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // 设置定义
  const settingDefinitions: SettingDefinition[] = [
    // 编辑器设置
    {
      key: 'editor.fontSize',
      title: 'Font Size',
      description: '控制字体大小（像素）',
      type: 'number',
      category: '编辑器',
      min: 8,
      max: 100,
      default: 14,
    },
    {
      key: 'editor.fontFamily',
      title: 'Font Family',
      description: '控制字体系列',
      type: 'string',
      category: '编辑器',
      default: 'Consolas, "Courier New", monospace',
    },
    {
      key: 'editor.lineHeight',
      title: 'Line Height',
      description: '控制行高',
      type: 'number',
      category: '编辑器',
      min: 1,
      max: 3,
      default: 1.5,
    },
    {
      key: 'editor.tabSize',
      title: 'Tab Size',
      description: '一个制表符等于的空格数',
      type: 'number',
      category: '编辑器',
      min: 1,
      max: 8,
      default: 4,
    },
    {
      key: 'editor.insertSpaces',
      title: 'Insert Spaces',
      description: '按 Tab 键时插入空格',
      type: 'boolean',
      category: '编辑器',
      default: true,
    },
    {
      key: 'editor.wordWrap',
      title: 'Word Wrap',
      description: '控制换行的方式',
      type: 'select',
      category: '编辑器',
      options: ['off', 'on', 'wordWrapColumn', 'bounded'],
      default: 'off',
    },
    {
      key: 'editor.minimap.enabled',
      title: 'Minimap Enabled',
      description: '控制是否显示小地图',
      type: 'boolean',
      category: '编辑器',
      default: true,
    },
    {
      key: 'editor.lineNumbers',
      title: 'Line Numbers',
      description: '控制行号的显示',
      type: 'select',
      category: '编辑器',
      options: ['on', 'off', 'relative'],
      default: 'on',
    },
    {
      key: 'editor.renderWhitespace',
      title: 'Render Whitespace',
      description: '控制空白字符的显示方式',
      type: 'select',
      category: '编辑器',
      options: ['none', 'boundary', 'selection', 'all'],
      default: 'selection',
    },
    {
      key: 'editor.cursorBlinking',
      title: 'Cursor Blinking',
      description: '控制光标动画样式',
      type: 'select',
      category: '编辑器',
      options: ['blink', 'smooth', 'phase', 'expand', 'solid'],
      default: 'blink',
    },
    {
      key: 'editor.cursorStyle',
      title: 'Cursor Style',
      description: '控制光标样式',
      type: 'select',
      category: '编辑器',
      options: ['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'],
      default: 'line',
    },

    // 文件设置
    {
      key: 'files.autoSave',
      title: 'Auto Save',
      description: '控制自动保存的时机',
      type: 'select',
      category: '文件',
      options: ['off', 'afterDelay', 'onFocusChange', 'onWindowChange'],
      default: 'afterDelay',
    },
    {
      key: 'files.autoSaveDelay',
      title: 'Auto Save Delay',
      description: '自动保存延迟（毫秒）',
      type: 'number',
      category: '文件',
      min: 100,
      max: 10000,
      default: 1000,
    },
    {
      key: 'files.encoding',
      title: 'Encoding',
      description: '文件编码',
      type: 'string',
      category: '文件',
      default: 'utf8',
    },
    {
      key: 'files.eol',
      title: 'End of Line',
      description: '文件换行符',
      type: 'select',
      category: '文件',
      options: ['\\n', '\\r\\n', 'auto'],
      default: 'auto',
    },

    // 工作区设置
    {
      key: 'workbench.colorTheme',
      title: 'Color Theme',
      description: '指定工作区颜色主题',
      type: 'string',
      category: '工作区',
      default: 'One Dark Pro',
    },
    {
      key: 'workbench.iconTheme',
      title: 'Icon Theme',
      description: '指定工作区图标主题',
      type: 'string',
      category: '工作区',
      default: 'vs-seti',
    },
    {
      key: 'workbench.sideBar.location',
      title: 'Side Bar Location',
      description: '控制侧边栏的位置',
      type: 'select',
      category: '工作区',
      options: ['left', 'right'],
      default: 'left',
    },
    {
      key: 'workbench.activityBar.visible',
      title: 'Activity Bar Visible',
      description: '控制活动栏是否可见',
      type: 'boolean',
      category: '工作区',
      default: true,
    },
    {
      key: 'workbench.statusBar.visible',
      title: 'Status Bar Visible',
      description: '控制状态栏是否可见',
      type: 'boolean',
      category: '工作区',
      default: true,
    },

    // 窗口设置
    {
      key: 'window.zoomLevel',
      title: 'Zoom Level',
      description: '调整窗口缩放级别',
      type: 'number',
      category: '窗口',
      min: -5,
      max: 5,
      default: 0,
    },
    {
      key: 'window.title',
      title: 'Window Title',
      description: '控制窗口标题',
      type: 'string',
      category: '窗口',
      default: '${activeEditorShort}${separator}${rootName}',
    },
    {
      key: 'window.menuBarVisibility',
      title: 'Menu Bar Visibility',
      description: '控制菜单栏的可见性',
      type: 'select',
      category: '窗口',
      options: ['default', 'visible', 'toggle', 'hidden'],
      default: 'default',
    },

    // 搜索设置
    {
      key: 'search.useIgnoreFiles',
      title: 'Use Ignore Files',
      description: '搜索时使用 .gitignore 和 .ignore 文件',
      type: 'boolean',
      category: '搜索',
      default: true,
    },
    {
      key: 'search.followSymlinks',
      title: 'Follow Symlinks',
      description: '搜索时跟随符号链接',
      type: 'boolean',
      category: '搜索',
      default: true,
    },
  ];

  // 加载设置
  const loadSettings = useCallback(async () => {
    try {
      const result = await window.electronAPI?.settings?.getAll();
      if (result?.success && result.data) {
        setSettings(result.data);
        setJsonContent(JSON.stringify(result.data, null, 2));
      }
    } catch (err) {
      console.error('[SettingsEditor] 加载设置失败:', err);
      setError('加载设置失败');
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // 更新单个设置
  const updateSetting = async (key: string, value: any) => {
    try {
      const result = await window.electronAPI?.settings?.update(key, value);
      if (result?.success) {
        setSettings(prev => ({ ...prev, [key]: value }));
        setJsonContent(JSON.stringify({ ...settings, [key]: value }, null, 2));
        setModifiedKeys(prev => new Set([...prev, key]));
      } else {
        setError(result?.error || '更新失败');
      }
    } catch (err) {
      console.error('[SettingsEditor] 更新设置失败:', err);
      setError('更新设置失败');
    }
  };

  // 从 JSON 保存设置
  const saveFromJson = async () => {
    try {
      setSaving(true);
      setError('');
      
      const parsed = JSON.parse(jsonContent);
      const result = await window.electronAPI?.settings?.updateMany(parsed);
      
      if (result?.success) {
        setSettings(parsed);
        setModifiedKeys(new Set());
        console.log('[SettingsEditor] 设置保存成功');
      } else {
        setError(result?.error || '保存失败');
      }
    } catch (err) {
      console.error('[SettingsEditor] 保存设置失败:', err);
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 重置设置
  const resetSetting = async (key: string) => {
    const definition = settingDefinitions.find(d => d.key === key);
    if (definition) {
      await updateSetting(key, definition.default);
    }
  };

  // 按类别分组设置
  const groupedSettings = settingDefinitions.reduce((acc, def) => {
    if (!acc[def.category]) {
      acc[def.category] = [];
    }
    acc[def.category].push(def);
    return acc;
  }, {} as Record<string, SettingDefinition[]>);

  // 过滤设置
  const filterSettings = (definitions: SettingDefinition[]) => {
    if (!searchQuery) return definitions;
    const query = searchQuery.toLowerCase();
    return definitions.filter(def =>
      def.title.toLowerCase().includes(query) ||
      def.description.toLowerCase().includes(query) ||
      def.key.toLowerCase().includes(query)
    );
  };

  // 渲染设置项
  const renderSettingControl = (def: SettingDefinition) => {
    const value = settings[def.key] ?? def.default;
    const isModified = modifiedKeys.has(def.key);

    switch (def.type) {
      case 'boolean':
        return (
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => updateSetting(def.key, e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm" style={{ color: 'var(--editor-fg)' }}>
              {def.title}
            </span>
          </label>
        );

      case 'number':
        return (
          <div>
            <label className="text-sm block mb-1" style={{ color: 'var(--editor-fg)' }}>
              {def.title}
            </label>
            <input
              type="number"
              value={value}
              min={def.min}
              max={def.max}
              onChange={(e) => updateSetting(def.key, parseFloat(e.target.value))}
              className="w-full px-3 py-1.5 rounded text-sm"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-fg)',
                border: '1px solid var(--input-border)',
              }}
            />
          </div>
        );

      case 'string':
        return (
          <div>
            <label className="text-sm block mb-1" style={{ color: 'var(--editor-fg)' }}>
              {def.title}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => updateSetting(def.key, e.target.value)}
              className="w-full px-3 py-1.5 rounded text-sm"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-fg)',
                border: '1px solid var(--input-border)',
              }}
            />
          </div>
        );

      case 'select':
        return (
          <div>
            <label className="text-sm block mb-1" style={{ color: 'var(--editor-fg)' }}>
              {def.title}
            </label>
            <CustomSelect
              value={value}
              onChange={(newValue) => updateSetting(def.key, newValue)}
              items={def.options?.map(option => ({ value: option, label: option })) || []}
              className="text-sm"
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="settings-editor h-full flex flex-col" style={{ backgroundColor: 'var(--editor-bg)' }}>
      {/* 头部工具栏 */}
      <div
        className="settings-header flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--editor-fg)' }}>
            设置
          </h2>
          
          {/* 模式切换 */}
          <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
            <button
              onClick={() => setMode('ui')}
              className="px-4 py-1.5 text-sm"
              style={{
                backgroundColor: 'transparent',
                color: mode === 'ui' ? 'var(--tab-active-fg)' : 'var(--editor-fg)',
                opacity: mode === 'ui' ? 1 : 0.7,
                borderBottom: mode === 'ui' ? '2px solid var(--tab-active-border-top)' : '2px solid transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.1s ease',
                fontWeight: mode === 'ui' ? 600 : 400
              }}
              onMouseEnter={(e) => {
                if (mode !== 'ui') {
                  e.currentTarget.style.backgroundColor = 'var(--list-hover-bg)';
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                if (mode !== 'ui') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.opacity = '0.7';
                }
              }}
            >
              用户界面
            </button>
            <button
              onClick={() => setMode('json')}
              className="px-4 py-1.5 text-sm"
              style={{
                backgroundColor: 'transparent',
                color: mode === 'json' ? 'var(--tab-active-fg)' : 'var(--editor-fg)',
                opacity: mode === 'json' ? 1 : 0.7,
                borderBottom: mode === 'json' ? '2px solid var(--tab-active-border-top)' : '2px solid transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.1s ease',
                fontWeight: mode === 'json' ? 600 : 400
              }}
              onMouseEnter={(e) => {
                if (mode !== 'json') {
                  e.currentTarget.style.backgroundColor = 'var(--list-hover-bg)';
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                if (mode !== 'json') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.opacity = '0.7';
                }
              }}
            >
              JSON
            </button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center space-x-2">
          {mode === 'json' && (
            <button
              onClick={saveFromJson}
              disabled={saving}
              className="px-3 py-1 text-sm rounded"
              style={{
                backgroundColor: 'var(--button-bg)',
                color: 'var(--button-fg)',
              }}
            >
              {saving ? '保存中...' : '保存 JSON'}
            </button>
          )}
          
          {onClose && (
            <button
              onClick={onClose}
              className="text-sm"
              style={{ color: 'var(--editor-fg)', opacity: 0.6 }}
              title="关闭"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 bg-red-500 text-white text-sm">
          {error}
        </div>
      )}

      {/* 内容区 */}
      {mode === 'ui' ? (
        <div className="flex-1 overflow-auto">
          {/* 搜索框 */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <input
              type="text"
              placeholder="搜索设置..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-fg)',
                border: '1px solid var(--input-border)',
              }}
            />
          </div>

          {/* 设置列表 */}
          <div className="px-4 py-4 space-y-6">
            {Object.entries(groupedSettings).map(([category, definitions]) => {
              const filtered = filterSettings(definitions);
              if (filtered.length === 0) return null;

              return (
                <div key={category} className="setting-category">
                  <h3
                    className="text-xs font-semibold uppercase mb-3"
                    style={{ color: 'var(--editor-fg)', opacity: 0.6 }}
                  >
                    {category}
                  </h3>
                  <div className="space-y-4">
                    {filtered.map((def) => {
                      const isModified = modifiedKeys.has(def.key);
                      return (
                        <div
                          key={def.key}
                          className="setting-item p-3 rounded"
                          style={{
                            backgroundColor: isModified ? 'var(--list-hover-bg)' : 'transparent',
                            border: '1px solid',
                            borderColor: isModified ? 'var(--accent-color)' : 'transparent',
                          }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-mono" style={{ color: 'var(--editor-fg)', opacity: 0.6 }}>
                                  {def.key}
                                </span>
                                {isModified && (
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}>
                                    已修改
                                  </span>
                                )}
                              </div>
                              <p className="text-sm mt-1" style={{ color: 'var(--editor-fg)', opacity: 0.8 }}>
                                {def.description}
                              </p>
                            </div>
                            <button
                              onClick={() => resetSetting(def.key)}
                              className="ml-2 text-xs px-2 py-1 rounded"
                              style={{
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--input-fg)',
                              }}
                              title="重置为默认值"
                            >
                              重置
                            </button>
                          </div>
                          <div className="mt-2">
                            {renderSettingControl(def)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // JSON 编辑模式
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            height="100%"
            language="json"
            value={jsonContent}
            onChange={(value) => setJsonContent(value || '')}
            theme={theme?.type === 'dark' ? 'vs-dark' : 'vs'}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 14,
              lineNumbers: 'on',
              renderWhitespace: 'selection',
              tabSize: 2,
            }}
          />
        </div>
      )}
    </div>
  );
};
