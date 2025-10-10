// packages/renderer/src/components/Layout/MenuBar.example.tsx
// 菜单栏组件使用示例

import React, { useState } from 'react';
import { MenuBar } from './MenuBar';

/**
 * MenuBar 使用示例
 * 
 * 这个组件实现了类似 VS Code 的菜单栏功能
 */
export const MenuBarExample: React.FC = () => {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [panelVisible, setPanelVisible] = useState(true);
  const [aiPanelVisible, setAiPanelVisible] = useState(false);

  const handleToggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
    console.log('侧边栏状态:', !sidebarVisible);
  };

  const handleTogglePanel = () => {
    setPanelVisible(!panelVisible);
    console.log('面板状态:', !panelVisible);
  };

  const handleToggleAIPanel = () => {
    setAiPanelVisible(!aiPanelVisible);
    console.log('AI 面板状态:', !aiPanelVisible);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <MenuBar
        onToggleSidebar={handleToggleSidebar}
        onTogglePanel={handleTogglePanel}
        onToggleAIPanel={handleToggleAIPanel}
      />
      
      <div style={{ flex: 1, display: 'flex', padding: 20 }}>
        <div style={{ flex: 1 }}>
          <h2>菜单栏组件演示</h2>
          <div style={{ marginTop: 20 }}>
            <h3>当前状态：</h3>
            <ul>
              <li>侧边栏：{sidebarVisible ? '显示' : '隐藏'}</li>
              <li>面板：{panelVisible ? '显示' : '隐藏'}</li>
              <li>AI 面板：{aiPanelVisible ? '显示' : '隐藏'}</li>
            </ul>
          </div>
          
          <div style={{ marginTop: 30 }}>
            <h3>功能说明：</h3>
            <ul>
              <li>点击菜单标题打开下拉菜单</li>
              <li>支持多级子菜单（悬停显示）</li>
              <li>支持快捷键显示</li>
              <li>支持复选标记（checked 状态）</li>
              <li>支持禁用状态（disabled）</li>
              <li>支持分隔线（separator）</li>
              <li>点击菜单外部自动关闭</li>
            </ul>
          </div>

          <div style={{ marginTop: 30 }}>
            <h3>快捷键：</h3>
            <ul>
              <li><code>Ctrl+N</code> - 新建文件</li>
              <li><code>Ctrl+S</code> - 保存</li>
              <li><code>Ctrl+B</code> - 切换侧边栏</li>
              <li><code>Ctrl+J</code> - 切换面板</li>
              <li><code>Ctrl+Shift+A</code> - 打开 AI 助手</li>
              <li><code>Ctrl+Shift+P</code> - 命令面板</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MenuBarExample;
