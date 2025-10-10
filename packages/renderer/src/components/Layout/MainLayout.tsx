/**
 * 主布局容器
 * VSCode 风格的应用程序布局
 */

import React, { useState, useEffect, useRef } from 'react';
import { TitleBar } from '../TitleBar';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar/Sidebar';
import { EditorArea } from './EditorArea/EditorArea';
import { StatusBar } from './StatusBar';
import { AIChatPanel } from './AIChatPanel';
import { VSCodeCommandCenter } from '../../command-center/VSCodeCommandCenter';
import { ThemeCommandProvider } from '../../command-center/ThemeCommandProvider';
import { IconThemeCommandProvider } from '../../command-center/IconThemeCommandProvider';
import { MarkdownCommandProvider } from '../../command-center/MarkdownCommandProvider';
import { FileCommandProvider } from '../../command-center/FileCommandProvider';
import { IconThemeProvider } from '../../contexts/IconThemeContext';

export type ActivityBarItem = 'explorer' | 'search' | 'source-control' | 'extensions' | 'knowledge-base' | 'ai-model' | 'user' | 'settings';

interface MainLayoutProps {
  className?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ className = '' }) => {
  const [activeActivity, setActiveActivity] = useState<ActivityBarItem>('explorer');
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isAIChatVisible, setIsAIChatVisible] = useState(false);
  
  // 全局命令中心
  const commandCenterRef = useRef<VSCodeCommandCenter | null>(null);
  const themeProviderRef = useRef<ThemeCommandProvider | null>(null);
  const iconThemeProviderRef = useRef<IconThemeCommandProvider | null>(null);
  const markdownProviderRef = useRef<MarkdownCommandProvider | null>(null);
  const fileProviderRef = useRef<FileCommandProvider | null>(null);

  const handleActivityClick = (activity: ActivityBarItem) => {
    if (activity === 'settings') {
      // 点击设置时，隐藏侧边栏并触发打开设置事件（由 EditorArea 处理）
      setIsSidebarVisible(false);
      window.dispatchEvent(new Event('open-settings'));
      return;
    }

    if (activeActivity === activity) {
      // 如果点击当前活动的项，切换侧边栏可见性
      setIsSidebarVisible(!isSidebarVisible);
    } else {
      // 切换到新的活动项并显示侧边栏
      setActiveActivity(activity);
      setIsSidebarVisible(true);
    }
  };

  // 初始化全局命令中心
  useEffect(() => {
    console.log('[MainLayout] 初始化全局命令中心...');
    commandCenterRef.current = new VSCodeCommandCenter();
    themeProviderRef.current = new ThemeCommandProvider(commandCenterRef.current);
    iconThemeProviderRef.current = new IconThemeCommandProvider(commandCenterRef.current);
    markdownProviderRef.current = new MarkdownCommandProvider(commandCenterRef.current);
    fileProviderRef.current = new FileCommandProvider(commandCenterRef.current);
    
    // 等待命令提供者初始化完成
    Promise.all([
      themeProviderRef.current.ensureInitialized(),
      iconThemeProviderRef.current.ensureInitialized()
    ]).then(() => {
      console.log('[MainLayout] 全局命令中心初始化完成（包括主题和图标主题数据）');
    }).catch(error => {
      console.error('[MainLayout] 命令提供者初始化失败:', error);
    });

    // 将命令中心实例暴露给全局，以便 MonacoEditor 可以访问
    (window as any).__commandCenter = commandCenterRef.current;

    return () => {
      commandCenterRef.current = null;
      themeProviderRef.current = null;
      iconThemeProviderRef.current = null;
      markdownProviderRef.current = null;
      (window as any).__commandCenter = null;
    };
  }, []);

  // 监听快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 - 打开命令面板
      if (e.key === 'F1') {
        e.preventDefault();
        console.log('[MainLayout] F1 键按下，打开命令面板');
        commandCenterRef.current?.show('>');
        return;
      }

      // Ctrl+Shift+P - 打开命令面板（备用快捷键）
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        console.log('[MainLayout] Ctrl+Shift+P 按下，打开命令面板');
        commandCenterRef.current?.show('>');
        return;
      }

      // Ctrl+, 打开设置
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setIsSidebarVisible(false);
        window.dispatchEvent(new Event('open-settings'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <IconThemeProvider>
      <div 
        className={`main-layout ${className}`} 
        style={{ 
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--app-bg)',
          overflow: 'hidden'
        }}
      >
        {/* 标题栏（包含菜单栏） */}
        <div style={{ flexShrink: 0, height: '32px', position: 'relative', zIndex: 1000 }}>
          <TitleBar 
            onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
            onToggleAIPanel={() => setIsAIChatVisible(!isAIChatVisible)}
          />
        </div>
        
        {/* 主内容区 */}
        <div 
          className="main-content" 
          style={{ 
            flex: 1, 
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
            position: 'relative',
            minHeight: 0
          }}
        >
          {/* 活动栏 */}
          <div style={{ flexShrink: 0, width: '48px', height: '100%', position: 'relative' }}>
            <ActivityBar 
              activeItem={activeActivity}
              onActivityClick={handleActivityClick}
            />
          </div>
          
          {/* 侧边栏 */}
          {isSidebarVisible && (
            <Sidebar 
              activeView={activeActivity}
              onClose={() => setIsSidebarVisible(false)}
            />
          )}
          
          {/* 编辑器区域 */}
          <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
            <EditorArea />
          </div>

          {/* AI 对话面板 */}
          {isAIChatVisible && (
            <AIChatPanel onClose={() => setIsAIChatVisible(false)} />
          )}
        </div>
        
        {/* 状态栏 */}
        <div style={{ 
          flexShrink: 0, 
          height: '24px', 
          minHeight: '24px',
          maxHeight: '24px',
          position: 'relative', 
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          <StatusBar />
        </div>
      </div>
    </IconThemeProvider>
  );
};