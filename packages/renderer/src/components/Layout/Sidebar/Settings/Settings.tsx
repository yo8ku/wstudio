/**
 * 设置面板组件
 */

import React, { useState, useEffect } from 'react';

interface SettingItem {
  id: string;
  label: string;
  type: 'checkbox' | 'select' | 'input' | 'theme-select';
  value: any;
  options?: string[];
}

export const Settings: React.FC = () => {
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
            <span className="text-sm" style={{ color: 'var(--ws-sidebar-foreground)' }}>{setting.label}</span>
          </label>
        );
      
      case 'select':
        return (
          <div>
            <label className="text-sm block mb-2" style={{ color: 'var(--ws-sidebar-foreground)' }}>
              {setting.label}
            </label>
            <select
              value={setting.value}
              onChange={(e) => updateSetting(setting.id, e.target.value)}
              className="w-full px-3 py-2 rounded focus:outline-none text-sm"
              style={{ 
                backgroundColor: 'var(--ws-input-background)', 
                color: 'var(--ws-input-foreground)', 
                border: '1px solid var(--ws-input-border)'
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
            <label className="text-sm block mb-2" style={{ color: 'var(--ws-sidebar-foreground)' }}>
              {setting.label}
            </label>
            <input
              type="text"
              value={setting.value}
              onChange={(e) => updateSetting(setting.id, e.target.value)}
              className="w-full px-3 py-2 rounded focus:outline-none text-sm"
              style={{ 
                backgroundColor: 'var(--ws-input-background)', 
                color: 'var(--ws-input-foreground)', 
                border: '1px solid var(--ws-input-border)'
              }}
            />
          </div>
        );
    }
  };

  return (
    <div className="settings-panel p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--ws-sidebar-foreground)' }}>设置</h2>
        
        {/* 搜索设置 */}
        <input
          type="text"
          placeholder="搜索设置..."
          className="w-full px-3 py-2 rounded focus:outline-none text-sm mb-4"
          style={{ 
            backgroundColor: 'var(--ws-input-background)', 
            color: 'var(--ws-input-foreground)', 
            border: '1px solid var(--ws-input-border)',
          }}
        />
      </div>

      {/* 设置分类 */}
      <div className="space-y-6">
        {/* 编辑器设置 */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--ws-sidebar-foreground)', opacity: 0.6 }}>
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
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--ws-sidebar-foreground)', opacity: 0.6 }}>
            工作区
          </h3>
          <div className="space-y-4">
            <button 
              className="w-full px-4 py-2 text-sm rounded text-left transition-colors"
              style={{ 
                backgroundColor: 'var(--ws-input-background)', 
                color: 'var(--ws-input-foreground)'
              }}
            >
              打开工作区设置
            </button>
            <button 
              className="w-full px-4 py-2 text-sm rounded text-left transition-colors"
              style={{ 
                backgroundColor: 'var(--ws-input-background)', 
                color: 'var(--ws-input-foreground)'
              }}
            >
              打开用户设置
            </button>
          </div>
        </div>

        {/* 快捷键设置 */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--ws-sidebar-foreground)', opacity: 0.6 }}>
            快捷键          </h3>
          <button 
            className="w-full px-4 py-2 text-sm rounded text-left transition-colors"
            style={{ 
              backgroundColor: 'var(--ws-input-background)', 
              color: 'var(--ws-input-foreground)'
            }}
          >
            打开键盘快捷方式
          </button>
        </div>
      </div>
    </div>
  );
};
