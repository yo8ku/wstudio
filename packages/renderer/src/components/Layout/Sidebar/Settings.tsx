/**
 * 设置面板组件
 */

import React, { useState, useEffect } from 'react';
import type { ITheme } from '../../../types/electron';
import { useTheme } from '../../../contexts/ThemeContext';

interface SettingItem {
  id: string;
  label: string;
  type: 'checkbox' | 'select' | 'input' | 'theme-select';
  value: any;
  options?: string[];
}

export const Settings: React.FC = () => {
  const { applyTheme: applyThemeContext } = useTheme();
  const [themes, setThemes] = useState<ITheme[]>([]);
  const [currentThemeId, setCurrentThemeId] = useState<string>('');
  const [settings, setSettings] = useState<SettingItem[]>([
    {
      id: 'fontSize',
      label: '字体大小',
      type: 'input',
      value: '14'
    },
    {
      id: 'autoSave',
      label: '自动保存',
      type: 'checkbox',
      value: true
    },
    {
      id: 'wordWrap',
      label: '自动换行',
      type: 'checkbox',
      value: true
    }
  ]);

  useEffect(() => {
    loadThemes();
    loadCurrentTheme();
  }, []);

  const loadThemes = async () => {
    try {
      const result = await window.electronAPI?.theme.list();
      if (result?.success && result.data) {
        setThemes(result.data);
        console.log('[Settings] 加载了', result.data.length, '个主题');
      }
    } catch (error) {
      console.error('[Settings] 加载主题列表失败:', error);
    }
  };

  const loadCurrentTheme = async () => {
    try {
      const result = await window.electronAPI?.theme.getCurrent();
      if (result?.success && result.data) {
        setCurrentThemeId(result.data.id);
      }
    } catch (error) {
      console.error('[Settings] 加载当前主题失败:', error);
    }
  };

  const applyTheme = async (themeId: string) => {
    try {
      await applyThemeContext(themeId);
      setCurrentThemeId(themeId);
      console.log('[Settings] 应用主题成功:', themeId);
    } catch (error) {
      console.error('[Settings] 应用主题失败:', error);
    }
  };

  const updateSetting = (id: string, value: any) => {
    setSettings(settings.map(s =>
      s.id === id ? { ...s, value } : s
    ));
  };

  const renderSetting = (setting: SettingItem) => {
    switch (setting.type) {
      case 'checkbox':
        return (
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={setting.value}
              onChange={(e) => updateSetting(setting.id, e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm" style={{ color: 'var(--sidebar-fg)' }}>{setting.label}</span>
          </label>
        );
      
      case 'select':
        return (
          <div>
            <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
              {setting.label}
            </label>
            <select
              value={setting.value}
              onChange={(e) => updateSetting(setting.id, e.target.value)}
              className="w-full px-3 py-2 rounded focus:outline-none text-sm"
              style={{ 
                backgroundColor: 'var(--input-bg)', 
                color: 'var(--input-fg)', 
                border: '1px solid var(--input-border)'
              }}
            >
              {setting.options?.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );
      
      case 'input':
        return (
          <div>
            <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
              {setting.label}
            </label>
            <input
              type="text"
              value={setting.value}
              onChange={(e) => updateSetting(setting.id, e.target.value)}
              className="w-full px-3 py-2 rounded focus:outline-none text-sm"
              style={{ 
                backgroundColor: 'var(--input-bg)', 
                color: 'var(--input-fg)', 
                border: '1px solid var(--input-border)'
              }}
            />
          </div>
        );
    }
  };

  return (
    <div className="settings-panel p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--sidebar-fg)' }}>设置</h2>
        
        {/* 搜索设置 */}
        <input
          type="text"
          placeholder="搜索设置..."
          className="w-full px-3 py-2 rounded focus:outline-none text-sm mb-4"
          style={{ 
            backgroundColor: 'var(--input-bg)', 
            color: 'var(--input-fg)', 
            border: '1px solid var(--input-border)',
          }}
        />
      </div>

      {/* 设置分类 */}
      <div className="space-y-6">
        {/* 外观设置 */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            外观
          </h3>
          <div className="space-y-4">
            {/* 主题选择器 */}
            <div>
              <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
                颜色主题
              </label>
              <select
                value={currentThemeId}
                onChange={(e) => applyTheme(e.target.value)}
                className="w-full px-3 py-2 rounded focus:outline-none text-sm"
                style={{ 
                  backgroundColor: 'var(--input-bg)', 
                  color: 'var(--input-fg)', 
                  border: '1px solid var(--input-border)'
                }}
              >
                {themes.length === 0 ? (
                  <option value="">加载中...</option>
                ) : (
                  <>
                    {/* 按类型分组显示主题 */}
                    <optgroup label="深色主题">
                      {themes.filter(t => t.type === 'dark').map(theme => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="浅色主题">
                      {themes.filter(t => t.type === 'light').map(theme => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </optgroup>
                    {themes.some(t => t.type === 'hc') && (
                      <optgroup label="高对比度主题">
                        {themes.filter(t => t.type === 'hc').map(theme => (
                          <option key={theme.id} value={theme.id}>
                            {theme.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                )}
              </select>
              {themes.length > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
                  共 {themes.length} 个主题可用
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 编辑器设置 */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            编辑器
          </h3>
          <div className="space-y-4">
            {settings.map(setting => (
              <div key={setting.id}>
                {renderSetting(setting)}
              </div>
            ))}
          </div>
        </div>

        {/* 工作区设置 */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            工作区
          </h3>
          <div className="space-y-4">
            <button 
              className="w-full px-4 py-2 text-sm rounded text-left transition-colors"
              style={{ 
                backgroundColor: 'var(--input-bg)', 
                color: 'var(--input-fg)'
              }}
            >
              打开工作区设置
            </button>
            <button 
              className="w-full px-4 py-2 text-sm rounded text-left transition-colors"
              style={{ 
                backgroundColor: 'var(--input-bg)', 
                color: 'var(--input-fg)'
              }}
            >
              打开用户设置
            </button>
          </div>
        </div>

        {/* 快捷键设置 */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            快捷键
          </h3>
          <button 
            className="w-full px-4 py-2 text-sm rounded text-left transition-colors"
            style={{ 
              backgroundColor: 'var(--input-bg)', 
              color: 'var(--input-fg)'
            }}
          >
            打开键盘快捷方式
          </button>
        </div>
      </div>
    </div>
  );
};
