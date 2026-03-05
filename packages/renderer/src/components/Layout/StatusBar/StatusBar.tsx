/**
 * 状态栏组件
 * 功能：显示编辑器状态、扩展信息等
 */

import React, { useState, useEffect, useRef } from "react";
import "./StatusBar.scss";
import { BackgroundImageSettings } from "../../BackgroundImageSettings/index";
import { Icon } from "../../Icons/Icon";
import { useActivityBarStore } from "../../../stores/activityBarStore";
import { notification } from "../../Notification";

interface StatusBarProps {}

export const StatusBar: React.FC<StatusBarProps> = () => {
  const { sidebarPosition } = useActivityBarStore();
  const [pluginStatusBarItems, setPluginStatusBarItems] = useState<any[]>([]);
  const [wordCount, setWordCount] = useState<number>(0);

  // 新增：监听显示背景图片设置面板事件
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);

  // 新增：监听当前标签页的语言类型
  const [currentLanguage, setCurrentLanguage] = useState<string>("Markdown");

  // 新增：监听当前标签页类型（用于决定状态栏显示内容）
  const [currentTabType, setCurrentTabType] = useState<
    "file" | "settings" | "ai-config" | "markdown-preview" | "knowledge" | null
  >("file");

  // 工作区向量索引进度状态
  const [vectorIndexingProgress, setVectorIndexingProgress] = useState<{
    totalFiles: number;
    processedFiles: number;
    currentFile: string | null;
    status: 'idle' | 'scanning' | 'indexing' | 'paused' | 'completed' | 'error';
    workspaceTotalFiles?: number;  // 工作区总文件数
    indexedTotalFiles?: number;    // 已索引完成的文件总数
    vectorization?: {
      status: 'idle' | 'running' | 'completed';
      totalFiles: number;
      processedFiles: number;
      currentFile: string | null;
    };
  } | null>(null);

  // 索引进度状态（主进程的文件索引）
  const [indexingProgress, setIndexingProgress] = useState<{
    totalFiles: number;
    processedFiles: number;
    currentFile?: string;
  } | null>(null);


  // 监听显示背景图片设置面板的事件（单独处理，避免闭包问题）
  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error("[StatusBar] ========== ipcRenderer 未找到==========");
      console.error("[StatusBar] window.electron:", (window as any).electron);
      console.error("[StatusBar] 这可能是因为 preload.js 没有正确加载");
      return;
    }
    // 监听显示背景图片设置面板的事件
    const handleShowBackgroundSettings = (event: any, ...args: any[]) => {
      setShowBackgroundSettings(true);
    };

    try {
      ipcRenderer.on(
        "background-image:show-settings",
        handleShowBackgroundSettings
      );

    } catch (error) {
      console.error("[StatusBar] ❌ 注册事件监听器失败:", error);
    }

    return () => {
      try {
        ipcRenderer.removeListener(
          "background-image:show-settings",
          handleShowBackgroundSettings
        );
      } catch (error) {
        console.error("[StatusBar] ❌ 移除事件监听器失败:", error);
      }
    };
  }, []); // 只在组件挂载时注册一次

  // 监听插件系统的状态栏项
  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error("[StatusBar] ========== ipcRenderer 未找到==========");
      console.error("[StatusBar] window.electron:", (window as any).electron);
      console.error("[StatusBar] 这可能是因为 preload.js 没有正确加载");
      return;
    }

    // 通知主进程渲染进程已准备就绪
    ipcRenderer.send("renderer:loaded");

    // 初始化：获取所有已注册的状态栏项
    const loadStatusBarItems = async () => {
      try {
        const items = await ipcRenderer.invoke("plugin:get-status-bar-items");
        setPluginStatusBarItems(items);
      } catch (error) {
        console.error("[StatusBar] 加载状态栏项失败", error);
      }
    };

    // 等待主进程初始化完成后再加载状态栏项
    const handleMainProcessReady = () => {
      loadStatusBarItems();
    };

    // 监听主进程准备就绪事件
    ipcRenderer.once("main-process:ready", handleMainProcessReady);

    // 如果主进程已经就绪（热重载场景），直接加载
    // 设置一个短暂的延迟，给主进程一些初始化时间
    const timeoutId = setTimeout(() => {
     
      loadStatusBarItems();
    }, 1000);

    const handleStatusBarItem = (event: any, data: any) => {
    
      setPluginStatusBarItems((prev) => {
        if (data.action === "add") {
          // 检查是否已存在，避免重复添加
          const exists = prev.some((item) => item.id === data.item.id);
          if (exists) {
          
            return prev;
          }
      
          return [...prev, data.item];
        } else if (data.action === "update") {
          return prev.map((item) =>
            item.id === data.item.id ? data.item : item
          );
        } else if (data.action === "remove") {
          return prev.filter((item) => item.id !== data.id);
        }
        return prev;
      });
    };

    ipcRenderer.on("plugin:status-bar-item", handleStatusBarItem);

    return () => {
      clearTimeout(timeoutId);
      ipcRenderer.removeListener("main-process:ready", handleMainProcessReady);
      ipcRenderer.removeListener("plugin:status-bar-item", handleStatusBarItem);
    };
  }, []);

  // 监听当前标签页语言变化
  useEffect(() => {
    const handleTabLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ language: string }>;
      if (customEvent.detail?.language) {
        // 将语言类型转换为更友好的显示名称
        const languageMap: Record<string, string> = {
          markdown: "Markdown",
          json: "JSON",
          jsonc: "JSON with Comments",
          javascript: "JavaScript",
          typescript: "TypeScript",
          css: "CSS",
          html: "HTML",
          plaintext: "Plain Text",
        };
        const displayName =
          languageMap[customEvent.detail.language] ||
          customEvent.detail.language.toUpperCase();
        setCurrentLanguage(displayName);
      }
    };

    window.addEventListener("tab:language-changed", handleTabLanguageChange);

    return () => {
      window.removeEventListener(
        "tab:language-changed",
        handleTabLanguageChange
      );
    };
  }, []);

  // 监听活动标签页类型变化
  useEffect(() => {
    const calculateWordCount = (content: string): number => {
      if (!content) return 0;
      return content.replace(/\s+/g, "").length;
    };

    const handleContentChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ content?: string }>;
      const content = typeof customEvent.detail?.content === "string"
        ? customEvent.detail.content
        : "";
      setWordCount(calculateWordCount(content));
    };

    window.addEventListener("editor:content-changed", handleContentChanged);

    return () => {
      window.removeEventListener("editor:content-changed", handleContentChanged);
    };
  }, []);

  useEffect(() => {
    const handleActiveTabChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tabType:
          | "file"
          | "settings"
          | "ai-config"
          | "markdown-preview"
          | "knowledge"
          | null;
        isSettingsTab: boolean;
        isFileTab: boolean;
        isAIConfigTab: boolean;
        language?: string;
        path?: string;
      }>;


      if (customEvent.detail) {
        const { tabType, language } = customEvent.detail;

        // 使用 React.startTransition 来优化状态更新，避免闪烁
        React.startTransition(() => {
          setCurrentTabType(tabType);
          if (tabType !== "file") {
            setWordCount(0);
          }

          // 同时更新语言信息
          if (language) {
            const languageMap: Record<string, string> = {
              markdown: "Markdown",
              json: "JSON",
              jsonc: "JSON with Comments",
              javascript: "JavaScript",
              typescript: "TypeScript",
              css: "CSS",
              html: "HTML",
              plaintext: "Plain Text",
            };
            const displayName = languageMap[language] || language.toUpperCase();
            setCurrentLanguage(displayName);
          }
        });
      }
    };

    window.addEventListener(
      "editor:active-tab-changed",
      handleActiveTabChanged
    );

    return () => {
      window.removeEventListener(
        "editor:active-tab-changed",
        handleActiveTabChanged
      );
    };
  }, []);

  // 防止重复显示完成通知
  const hasShownCompletedRef = useRef<boolean>(false);
  // 记录是否有文件被处理过（用于判断是否需要显示完成通知）
  const hasProcessedFilesRef = useRef<boolean>(false);

  // 监听工作区向量索引服务进度（通过 IPC）
  useEffect(() => {
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.warn("[StatusBar] IPC 不可用，无法监听向量索引进度");
      return;
    }


    const unsubscribe = ipcRenderer.on('workspace-vector-index:progress', (_event: unknown, progress: {
      totalFiles: number;
      processedFiles: number;
      currentFile: string | null;
      status: 'idle' | 'scanning' | 'indexing' | 'paused' | 'completed' | 'error';
      workspaceTotalFiles?: number;
      indexedTotalFiles?: number;
      vectorization?: {
        status: 'idle' | 'running' | 'completed';
        totalFiles: number;
        processedFiles: number;
        currentFile: string | null;
      };
    }) => {
      // 当开始新的索引时，重置完成标志
      if (progress.status === 'scanning' || progress.status === 'indexing') {
        hasShownCompletedRef.current = false;
        hasProcessedFilesRef.current = progress.processedFiles > 0 || progress.totalFiles > 0;
      }
      
      // 记录是否有文件被处理
      if (progress.processedFiles > 0 || progress.totalFiles > 0) {
        hasProcessedFilesRef.current = true;
      }
      
      // 检测完成：索引完成且向量化也完成（或没有向量化任务）
      const indexCompleted = progress.status === 'completed';
      const vectorizationCompleted = !progress.vectorization || progress.vectorization.status === 'completed';
      
      if (indexCompleted && vectorizationCompleted && 
          hasProcessedFilesRef.current && 
          !hasShownCompletedRef.current) {
        hasShownCompletedRef.current = true;
        notification.success('索引完成');
      }
      
      setVectorIndexingProgress(progress);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 监听索引进度事件（主进程的文件索引）
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.workspaceIndex?.onProgress) {
      console.warn("[StatusBar] workspaceIndex.onProgress 不可用");
      return;
    }


    const unsubscribe = electron.workspaceIndex.onProgress(
      (
        progress: {
          totalFiles: number;
          processedFiles: number;
          currentFile?: string;
        } | null
      ) => {
        setIndexingProgress(progress);
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // 执行插件命令
  const executePluginCommand = async (commandId: string) => {
    try {
      const ipcRenderer = (window as any).electron?.ipcRenderer;
      if (ipcRenderer) {
        await ipcRenderer.invoke("plugin:execute-command", commandId);
      } else {
        console.error("[StatusBar] 无法执行命令，ipcRenderer 不可用");
      }
    } catch (error) {
      console.error("[StatusBar] 执行命令失败:", commandId, error);
    }
  };


  // 大纲图标组件
  const OutlineIcon = () => (
    <div className="status-bar-icon-btn" title="大纲">
      <svg
        className="status-bar-icon"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
      >
        <path d="M10 5h11"/>
        <path d="M10 12h11"/>
        <path d="M10 19h11"/>
        <path d="m3 10 3-3-3-3"/>
        <path d="m3 20 3-3-3-3"/>
      </svg>
    </div>
  );

  return (
    <>
      <div className="status-bar">
        {/* 左侧：扩展状态*/}
        <div className="status-bar-left">
          {/* 主进程索引进度显示 */}
          {indexingProgress && (
            <div className="status-bar-indexing">
              <Icon
                name="sync"
                size={14}
                style={{
                  animation: "spin 1s linear infinite",
                  display: "inline-flex",
                }}
              />
              <span className="status-bar-text">正在分析文件...</span>
            </div>
          )}

          {/* 插件系统的状态栏 */}
          {pluginStatusBarItems
            .filter((item) => item.alignment === "left" || !item.alignment)
            .sort((a, b) => (b.priority || 0) - (a.priority || 0))
            .map((item) => {
              return (
                <div
                  key={item.id}
                  className="status-bar-info-btn"
                  onClick={() =>
                    item.command && executePluginCommand(item.command)
                  }
                  title={item.tooltip || item.text}
                >
                  {item.text}
                </div>
              );
            })}

          {/* 大纲 - 当侧边栏在左边时显示在左边 */}
          {sidebarPosition === 'left' && <OutlineIcon />}

          {/* 向量索引进度显示 - 在大纲图标右侧 */}
          {vectorIndexingProgress && (vectorIndexingProgress.status === 'scanning' || vectorIndexingProgress.status === 'indexing') && (
            <div 
              className="status-bar-indexing" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}
              title={vectorIndexingProgress.currentFile || '正在索引工作区文件...'}
            >
              <Icon
                name="sync"
                size={12}
                style={{
                  animation: "spin 1s linear infinite",
                  display: "inline-flex",
                  opacity: 0.8,
                }}
              />
              <span className="status-bar-text" style={{ fontSize: '11px', opacity: 0.9 }}>
                {vectorIndexingProgress.status === 'scanning' ? '扫描中' : '索引'}
              </span>
              {/* 进度条 - 使用本次已处理/本次需要索引的数量 */}
              <div style={{ 
                width: '60px', 
                height: '4px', 
                backgroundColor: 'var(--ws-input-background, rgba(255,255,255,0.1))', 
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: (vectorIndexingProgress.totalFiles ?? 0) > 0 
                    ? `${((vectorIndexingProgress.processedFiles ?? 0) / (vectorIndexingProgress.totalFiles ?? 1)) * 100}%` 
                    : '0%',
                  height: '100%',
                  backgroundColor: 'var(--ws-button-background, #0e639c)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              {/* 显示：本次已处理/本次需要索引的数量 */}
              <span className="status-bar-text" style={{ fontSize: '10px', opacity: 0.7 }}>
                {vectorIndexingProgress.processedFiles ?? 0}/{vectorIndexingProgress.totalFiles ?? 0}
              </span>
            </div>
          )}

          {/* 索引进度显示 - 后台索引运行时显示 */}
          {vectorIndexingProgress?.vectorization?.status === 'running' && (
            <div 
              className="status-bar-indexing" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}
              title={vectorIndexingProgress.vectorization.currentFile || '正在索引...'}
            >
              <Icon
                name="sync"
                size={12}
                style={{
                  animation: "spin 2s linear infinite",
                  display: "inline-flex",
                  opacity: 0.6,
                }}
              />
              <span className="status-bar-text" style={{ fontSize: '11px', opacity: 0.8 }}>
                索引
              </span>
              {/* 索引进度条 */}
              <div style={{ 
                width: '50px', 
                height: '4px', 
                backgroundColor: 'var(--ws-input-background, rgba(255,255,255,0.1))', 
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: (vectorIndexingProgress.vectorization.totalFiles ?? 0) > 0 
                    ? `${((vectorIndexingProgress.vectorization.processedFiles ?? 0) / (vectorIndexingProgress.vectorization.totalFiles ?? 1)) * 100}%` 
                    : '0%',
                  height: '100%',
                  backgroundColor: 'var(--ws-statusbar-vectorizing, #4ec9b0)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              {/* 显示：已索引/总数 */}
              <span className="status-bar-text" style={{ fontSize: '10px', opacity: 0.6 }}>
                {vectorIndexingProgress.vectorization.processedFiles ?? 0}/{vectorIndexingProgress.vectorization.totalFiles ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* 右侧：编辑器状态*/}
        <div className="status-bar-right">
          {/* 文件标签页时显示的状态信息（包括插件项） */}
          {currentTabType === "file" && (
            <>
              {/* 插件系统的右侧状态栏 */}
              {pluginStatusBarItems
                .filter((item) => item.alignment === "right")
                .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                .map((item) => {
                  return (
                    <div
                      key={item.id}
                      className="status-bar-info-btn"
                      onClick={() =>
                        item.command && executePluginCommand(item.command)
                      }
                      title={item.tooltip || item.text}
                    >
                      {item.text}
                    </div>
                  );
                })}

              {/* 光标位置 */}
              <div className="status-bar-info-btn">字数 {wordCount}</div>

              {/* 文件编码 */}

              {/* 语言模式 */}
              <div className="status-bar-info-btn">{currentLanguage}</div>
            </>
          )}

          {/* 大纲 - 当侧边栏在右边时显示在右边 */}
          {sidebarPosition === 'right' && <OutlineIcon />}

          {/* 背景设置 - 始终显示 */}
          <div
            className="status-bar-icon-btn"
            title="背景设置"
            onClick={() => setShowBackgroundSettings(true)}
          >
            <Icon
              name="background-settings"
              iconSet="ui"
              size={14}
              className="status-bar-icon"
            />
          </div>

          {/* 通知中心 - 始终显示 */}
          <div className="status-bar-icon-btn" title="通知中心">
            <Icon
              name="notification"
              iconSet="ui"
              size={14}
              className="status-bar-icon"
            />
          </div>

          {/* 反馈 - 始终显示 */}
          <div className="status-bar-icon-btn" title="反馈">
            <svg
              className="status-bar-icon"
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

      {/* 背景图片设置面板 */}
      <BackgroundImageSettings
        visible={showBackgroundSettings}
        onClose={() => {
          setShowBackgroundSettings(false);
        }}
      />
    </>
  );
};
