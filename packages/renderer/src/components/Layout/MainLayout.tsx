/**
 * 主布局容器
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TitleBar } from '../TitleBar/TitleBar';
import { ActivityBar } from './ActivityBar';
import type { ActivityBarItem } from './ActivityBar/ActivityBar';
import { Sidebar } from './Sidebar/Sidebar';
import { EditorArea } from './EditorArea/EditorArea/EditorArea';
import { StatusBar } from './StatusBar/StatusBar';
import { AIChatPanel } from './AIChatPanel/AIChatPanel';
import { Panel } from './Panel';
import { RightActivityBar } from './RightActivityBar';
import { RightSidebar } from './RightSidebar';
import { VSCodeCommandCenter } from '../../command-center/VSCodeCommandCenter';
import { IconThemeCommandProvider } from '../../command-center/IconThemeCommandProvider';
import { ThemeCommandProvider } from '../../command-center/ThemeCommandProvider';
import { MarkdownCommandProvider } from '../../command-center/MarkdownCommandProvider';
import { FileCommandProvider } from '../../command-center/FileCommandProvider';
import { AIConfigCommandProvider } from '../../command-center/AIConfigCommandProvider';
import { SnippetsCommandProvider } from '../../command-center/SnippetsCommandProvider';
import { IconThemeProvider } from '../../contexts/IconThemeContext';
import { BackgroundImage } from '../BackgroundImage';
import { GlobalModal } from '../GlobalModal';
import { useBackgroundStore } from '../../stores/backgroundStore';
import { useRightSidebarStore } from '../../stores/rightSidebarStore';
import { useThemeStore } from '../../stores/themeStore';
import { useActivityBarStore } from '../../stores/activityBarStore';
import { snippetService } from '../../services/SnippetService';
import { shouldMigrateSnippets, migrateSnippetsFromJSON } from '../../utils/migrateSnippets';
import { notification } from '../Notification';

export type { ActivityBarItem };

interface MainLayoutProps {
  className?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ className = '' }) => {
  const [activeActivity, setActiveActivity] = useState<ActivityBarItem>('explorer');
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isAIChatVisible, setIsAIChatVisible] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(false); // 默认隐藏底部面板
  const [panelActiveView, setPanelActiveView] = useState<'snippets' | 'timeline' | 'terminal'>('terminal');
  const [aiChatPanelPosition, setAIChatPanelPosition] = useState<'right' | 'left'>('right'); // AI Chat Panel 位置

  // 获取背景图片配置（订阅状态以触发重新渲染）
  const { config } = useBackgroundStore();
  const backgroundEnabled = config.enabled && !!config.imagePath;
  
  // 获取右侧活动栏的显示状态
  const { isActivityBarVisible } = useRightSidebarStore();
  
  // 获取主侧栏位置
  const { sidebarPosition } = useActivityBarStore();
  
  // 全局命令中心
  const commandCenterRef = useRef<VSCodeCommandCenter | null>(null);
  const iconThemeProviderRef = useRef<IconThemeCommandProvider | null>(null);
  const themeProviderRef = useRef<ThemeCommandProvider | null>(null);
  const markdownProviderRef = useRef<MarkdownCommandProvider | null>(null);
  const fileProviderRef = useRef<FileCommandProvider | null>(null);
  const aiConfigProviderRef = useRef<AIConfigCommandProvider | null>(null);
  const snippetsProviderRef = useRef<SnippetsCommandProvider | null>(null);

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

  const handleAIChatMoveLeft = () => {
    setAIChatPanelPosition('left');
  };

  const handleAIChatMoveRight = () => {
    setAIChatPanelPosition('right');
  };

  // 监听打开底部面板事件
  useEffect(() => {
    const handleOpenPanel = (event: Event) => {
      const customEvent = event as CustomEvent<{ view?: 'snippets' | 'timeline' | 'terminal' }>;
      const view = customEvent.detail?.view || 'terminal';
      
      console.log('[MainLayout] 打开底部面板:', view);
      setPanelActiveView(view);
      setIsPanelVisible(true);
    };

    window.addEventListener('open-panel', handleOpenPanel);
    return () => {
      window.removeEventListener('open-panel', handleOpenPanel);
    };
  }, []);

  // 初始化主题系统
  const initializeTheme = useThemeStore((state) => state.initialize);
  const currentTheme = useThemeStore((state) => state.currentTheme);
  
  useEffect(() => {
    console.log('[MainLayout] 初始化主题系统...');
    initializeTheme().catch((error) => {
      console.error('[MainLayout] 主题系统初始化失败:', error);
    });
  }, [initializeTheme]);

  // 在根元素添加主题标识（light 或 dark）
  useEffect(() => {
    if (currentTheme) {
      const themeMode = currentTheme.type; // 'light' 或 'dark'
      document.documentElement.setAttribute('data-theme-mode', themeMode);
      console.log(`[MainLayout] 根元素主题标识已设置: data-theme-mode="${themeMode}"`);
    }
  }, [currentTheme]);

  // 初始化片段数据库和迁移
  useEffect(() => {
    const initSnippetDatabase = async () => {
      console.log('[MainLayout] 初始化片段数据库...');
      
      try {
        // 初始化数据库
        await snippetService.initialize();
        console.log('[MainLayout] 片段数据库初始化成功');
        
        // 检查是否需要迁移
        const needMigrate = await shouldMigrateSnippets();
        if (needMigrate) {
          console.log('[MainLayout] 检测到需要迁移片段数据...');
          const result = await migrateSnippetsFromJSON();
          
          if (result.success) {
            console.log(`[MainLayout] 成功迁移 ${result.count} 个片段到数据库`);
          } else {
            console.error('[MainLayout] 片段迁移失败:', result.error);
          }
        } else {
          console.log('[MainLayout] 无需迁移片段数据');
        }
      } catch (error) {
        console.error('[MainLayout] 片段数据库初始化失败:', error);
      }
    };
    
    initSnippetDatabase();
  }, []);

  // 初始化工作区后台索引服务（使用双 Worker Thread，不阻塞 UI）
  useEffect(() => {
    const initWorkspaceIndexing = async () => {
      try {
        console.log('[MainLayout] 初始化工作区后台索引服务...');

        const ipcRenderer = window.electron?.ipcRenderer;
        if (!ipcRenderer) {
          console.warn('[MainLayout] IPC 不可用，跳过索引');
          return;
        }

        // 等待主进程就绪
        await new Promise<void>((resolve) => {
          let resolved = false;
          const doResolve = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };

          ipcRenderer
            .invoke('workspace-index-db:get-stats')
            .then(() => doResolve())
            .catch(() => {
              const unsubscribe = ipcRenderer.on('main-process:ready', () => {
                unsubscribe();
                doResolve();
              });
            });

          setTimeout(doResolve, 10000);
        });

        console.log('[MainLayout] 主进程已就绪');

        // 始终监听进度更新（无论是自动索引还是手动索引）
        // 使用 preload 暴露的专用 API，回调只接收 progress 参数
        let lastErrorMessage = ''; // 防止重复显示相同错误
        const unsubscribe = window.electron?.workspaceVectorIndex?.onProgress((progress: { status: string; processedFiles?: number; totalFiles?: number; errorMessage?: string }) => {
          if (progress.status === 'scanning') {
            console.log('[WorkspaceIndexing] 正在扫描文件...');
          } else if (progress.status === 'indexing') {
            console.log(`[WorkspaceIndexing] 进度: ${progress.processedFiles}/${progress.totalFiles}`);
          } else if (progress.status === 'completed') {
            console.log('[WorkspaceIndexing] 索引完成');
            lastErrorMessage = ''; // 重置错误状态
            // 成功通知由 StatusBar 组件处理，避免重复
          } else if (progress.status === 'error') {
            const errorMsg = progress.errorMessage || '未知错误';
            // 防止重复显示相同错误
            if (errorMsg !== lastErrorMessage) {
              lastErrorMessage = errorMsg;
              console.error('[WorkspaceIndexing] 索引错误:', errorMsg);
              // 显示错误通知
              notification.error(errorMsg);
            }
          }
        });

        // 获取工作区路径
        const workspaceResult = await window.electron?.workspace?.getDir();
        if (!workspaceResult?.success || !workspaceResult.data) {
          console.warn('[MainLayout] 无法获取工作区路径，跳过索引');
          return () => {
            if (unsubscribe) unsubscribe();
          };
        }

        const workspacePath = workspaceResult.data;

        console.log(`[MainLayout] 检查自动索引配置: ${workspacePath}`);

        // 使用自动索引检查（会检查：自索引开关、服务商、模型、API Key）
        const result = await window.electron?.workspaceVectorIndex?.checkAutoIndex(workspacePath);
        if (!result?.success) {
          console.log('[MainLayout] 自动索引检查:', result?.data?.message || result?.error);
        }

        return () => {
          if (unsubscribe) unsubscribe();
        };
      } catch (error) {
        console.error('[MainLayout] 工作区索引服务初始化失败:', error);
      }
    };

    initWorkspaceIndexing();

    return () => {
      window.electron?.ipcRenderer?.invoke('workspace-vector-index:stop').catch(() => {});
    };
  }, []);

  // 初始化全局命令中心
  useEffect(() => {
    console.log('[MainLayout] 初始化全局命令中心...');
    // 如果全局已有实例，复用；否则创建新实例
    const commandCenter = (window as any).__commandCenter || new VSCodeCommandCenter();
    commandCenterRef.current = commandCenter;
    // 保存到全局，供其他组件使用
    (window as any).__commandCenter = commandCenter;
    iconThemeProviderRef.current = new IconThemeCommandProvider(commandCenter);
    themeProviderRef.current = new ThemeCommandProvider(commandCenter);
    markdownProviderRef.current = new MarkdownCommandProvider(commandCenter);
    fileProviderRef.current = new FileCommandProvider(commandCenter);
    aiConfigProviderRef.current = new AIConfigCommandProvider(commandCenter);
    snippetsProviderRef.current = new SnippetsCommandProvider(commandCenter);
    
    // 等待命令提供者初始化完成
    Promise.all([
      iconThemeProviderRef.current.ensureInitialized()
    ]).then(() => {
      console.log('[MainLayout] 全局命令中心初始化完成（包括图标主题数据）');
    }).catch(error => {
      console.error('[MainLayout] 命令提供者初始化失败:', error);
    });

    // 将命令中心实例暴露给全局，以便 MonacoEditor 可以访问
    (window as any).__commandCenter = commandCenterRef.current;

    return () => {
      commandCenterRef.current = null;
      iconThemeProviderRef.current = null;
      themeProviderRef.current = null;
      markdownProviderRef.current = null;
      aiConfigProviderRef.current = null;
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

      // Ctrl+` 切换面板显示/隐藏
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setIsPanelVisible(!isPanelVisible);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelVisible]);

  // 使用 useMemo 优化样式对象，避免每次渲染都创建新对象
  const mainLayoutStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    // 当背景图片启用时，使用透明背景；否则使用主题背景色
    backgroundColor: backgroundEnabled ? 'transparent' : 'var(--ws-editor-background)',
    overflow: 'hidden' as const,
    position: 'relative' as const
  }), [backgroundEnabled]);

  return (
    <IconThemeProvider>
      {/* 背景图片 */}
      <BackgroundImage />
      
      <div 
        className={`main-layout ${className}`} 
        style={mainLayoutStyle}
      >
        {/* 标题栏（包含菜单栏） */}
        <div className='titleBar' style={{ flexShrink: 0, height: '32px', position: 'relative'}}>
          <TitleBar 
            onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
            onToggleAIPanel={() => setIsAIChatVisible(!isAIChatVisible)}
            onTogglePanel={() => setIsPanelVisible(!isPanelVisible)}
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
          {/* 左侧主侧栏（ActivityBar + Sidebar）- 当 sidebarPosition === 'left' 时显示 */}
            <div className='left-ActivityBar' 
              style={{ 
              display: sidebarPosition === 'left' ? 'flex' : 'none', 
                order: 0,
                height: '100%',
                flexShrink: 0
              }}
            >
              {/* 活动栏 */}
              <div className='activity-bar' style={{ flexShrink: 0, width: '48px', height: '100%', position: 'relative' }}>
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

              <div className='left-ActivityBar-border'>

              </div>
            </div>

            {/*END 左侧主侧栏（ActivityBar + Sidebar）- 当 sidebarPosition === 'left' 时显示 */}
          
          {/* 编辑器区域和底部面板容器 */}
          <div 
            style={{ 
              flex: 1, 
              height: '100%', 
              overflow: 'hidden', 
              minWidth: 0, 
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid var(--ws-panel-border)',
              order: (() => {
                // AI Chat 在左侧时，编辑器在右边
                if (aiChatPanelPosition === 'left') return 2;
                // AI Chat 在右侧时，编辑器在左边
                return 1;
              })()
            }}
          >
            {/* 编辑器区域 */}
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <EditorArea />
            </div>

            {/* 底部面板 */}
            {isPanelVisible && (
              <Panel 
                activeView={panelActiveView}
                onClose={() => setIsPanelVisible(false)} 
              />
            )}
          </div>

          {/* AI 对话面板 */}
          {isAIChatVisible && (
            <div
              className='ai-chat-panel-right-border'
              style={{
                order: (() => {
                  // 如果主侧栏和 AI Chat 在同一侧，AI Chat 在主侧栏内侧
                  if (sidebarPosition === 'left' && aiChatPanelPosition === 'left') return 1;
                  if (sidebarPosition === 'right' && aiChatPanelPosition === 'right') return 2;
                  // 如果在不同侧
                  if (aiChatPanelPosition === 'left') return 1;
                  return 3;
                })(),
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                flexShrink: 0
              }}
            >
              <AIChatPanel

                onClose={() => setIsAIChatVisible(false)}
                onMoveLeft={handleAIChatMoveLeft}
                onMoveRight={handleAIChatMoveRight}
                position={aiChatPanelPosition}
              />
            </div>
          )}

          {/* 右侧主侧栏（Sidebar + ActivityBar）- 当 sidebarPosition === 'right' 时显示 */}
            <div className='right-ActivityBar' style={{ 
            display: sidebarPosition === 'right' ? 'flex' : 'none', 
              order: 3,
              height: '100%',
              flexShrink: 0
            }}>
              {/* 侧边栏 */}
              {isSidebarVisible && (
                <Sidebar 
                  activeView={activeActivity}
                  onClose={() => setIsSidebarVisible(false)}
                />
              )}
              
              {/* 活动栏 */}
              <div style={{ flexShrink: 0, width: '48px', height: '100%', position: 'relative' }}>
                <ActivityBar 
                  activeItem={activeActivity}
                  onActivityClick={handleActivityClick}
                />
              </div>
            </div>

          {/* 右侧边栏 */}
          <div style={{ 
            order: 10,
            height: '100%',
            flexShrink: 0
          }}>
            <RightSidebar />
          </div>

          {/* 右侧活动栏 - 根据状态显示隐藏 */}
          {isActivityBarVisible && (
            <div className='RightActivityBar' style={{ 
              flexShrink: 0, 
              width: '48px', 
              height: '100%', 
              position: 'relative', 
              order: 11 
            }}>
              <RightActivityBar />
            </div>
          )}
        </div>
        
        {/* 状态栏 */}
        <div className='StatusBar' style={{ 
          backgroundColor:'var(--ws-editor-background)',
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

      {/* 全局模态窗口 */}
      <GlobalModal />
    </IconThemeProvider>
  );
};