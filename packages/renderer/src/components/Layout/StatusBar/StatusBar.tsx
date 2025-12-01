/**
 * 状态栏组件
 * 功能：显示编辑器状态、扩展信息等
 */

import React, { useState, useEffect } from "react";
import "./StatusBar.scss";
import { BackgroundImageSettings } from "../../BackgroundImageSettings/index";
import { Icon } from "../../Icons/Icon";
import { useActivityBarStore } from "../../../stores/activityBarStore";

interface StatusBarProps {}

export const StatusBar: React.FC<StatusBarProps> = () => {
  const { sidebarPosition } = useActivityBarStore();
  const [pluginStatusBarItems, setPluginStatusBarItems] = useState<any[]>([]);

  // 新增：监听显示背景图片设置面板事件
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);

  // 新增：监听当前标签页的语言类型
  const [currentLanguage, setCurrentLanguage] = useState<string>("Markdown");

  // 新增：监听当前标签页类型（用于决定状态栏显示内容）
  const [currentTabType, setCurrentTabType] = useState<
    "file" | "settings" | "ai-config" | "markdown-preview" | "knowledge" | null
  >("file");

  // 索引进度状态
  const [indexingProgress, setIndexingProgress] = useState<{
    totalFiles: number;
    processedFiles: number;
    currentFile?: string;
  } | null>(null);

  // 调试：监控状态变量
  useEffect(() => {
    console.log(
      "[StatusBar] showBackgroundSettings 状态变量",
      showBackgroundSettings
    );
  }, [showBackgroundSettings]);

  // 监听显示背景图片设置面板的事件（单独处理，避免闭包问题）
  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error("[StatusBar] ========== ipcRenderer 未找到==========");
      console.error("[StatusBar] window.electron:", (window as any).electron);
      console.error("[StatusBar] 这可能是因为 preload.js 没有正确加载");
      return;
    }

    console.log(
      "[StatusBar] ========== 注册背景图片设置面板事件监听器 =========="
    );
    console.log("[StatusBar] ipcRenderer.on 类型:", typeof ipcRenderer.on);
    console.log("[StatusBar] ipcRenderer 对象:", ipcRenderer);

    // 监听显示背景图片设置面板的事件
    const handleShowBackgroundSettings = (event: any, ...args: any[]) => {
      console.log(
        "[StatusBar] ========== 收到显示背景图片设置面板事件 =========="
      );
      console.log("[StatusBar] event对象:", event);
      console.log("[StatusBar] 事件参数:", args);
      console.log("[StatusBar] 参数数量:", args.length);
      console.log("[StatusBar] 第一个参数", args[0]);
      console.log("[StatusBar] 即将设置 showBackgroundSettings 为 true");
      setShowBackgroundSettings(true);
      console.log("[StatusBar] setShowBackgroundSettings(true) 已调用");
      console.log(
        "[StatusBar] ==============================================="
      );
    };

    console.log("[StatusBar] 准备调用 ipcRenderer.on...");
    try {
      ipcRenderer.on(
        "background-image:show-settings",
        handleShowBackgroundSettings
      );
      console.log(
        "[StatusBar] ✅ 已成功监听 background-image:show-settings 事件"
      );
      console.log("[StatusBar] 事件监听器已注册，等待事件...");
    } catch (error) {
      console.error("[StatusBar] ❌ 注册事件监听器失败:", error);
    }

    // 测试：延迟检查事件监听器是否真的被注册
    setTimeout(() => {
      console.log("[StatusBar] [测试] 检查事件监听器状态...");
      console.log(
        "[StatusBar] [测试] showBackgroundSettings 当前值:",
        showBackgroundSettings
      );
    }, 1000);

    return () => {
      console.log("[StatusBar] 移除 background-image:show-settings 监听器");
      try {
        ipcRenderer.removeListener(
          "background-image:show-settings",
          handleShowBackgroundSettings
        );
        console.log("[StatusBar] ✅ 事件监听器已移除");
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

    console.log("[StatusBar] ========== 组件已挂载，开始初始化 ==========");
    console.log("[StatusBar] ipcRenderer 可用");

    // 通知主进程渲染进程已准备就绪
    console.log("[StatusBar] 通知主进程渲染进程已加载");
    ipcRenderer.send("renderer:loaded");

    // 初始化：获取所有已注册的状态栏项
    const loadStatusBarItems = async () => {
      try {
        console.log("[StatusBar] 正在请求状态栏项..");
        const items = await ipcRenderer.invoke("plugin:get-status-bar-items");
        console.log("[StatusBar] 加载已注册的状态栏项", items);
        console.log("[StatusBar] 状态栏项数据", items.length);
        setPluginStatusBarItems(items);
      } catch (error) {
        console.error("[StatusBar] 加载状态栏项失败", error);
      }
    };

    // 等待主进程初始化完成后再加载状态栏项
    const handleMainProcessReady = () => {
      console.log("[StatusBar] 主进程已准备就绪，开始加载状态栏项");
      loadStatusBarItems();
    };

    // 监听主进程准备就绪事件
    ipcRenderer.once("main-process:ready", handleMainProcessReady);

    // 如果主进程已经就绪（热重载场景），直接加载
    // 设置一个短暂的延迟，给主进程一些初始化时间
    const timeoutId = setTimeout(() => {
      console.log("[StatusBar] 超时触发，尝试加载状态栏项");
      loadStatusBarItems();
    }, 1000);

    const handleStatusBarItem = (event: any, data: any) => {
      console.log("[StatusBar] 收到状态栏项事件", data);
      setPluginStatusBarItems((prev) => {
        if (data.action === "add") {
          // 检查是否已存在，避免重复添加
          const exists = prev.some((item) => item.id === data.item.id);
          if (exists) {
            console.log("[StatusBar] 状态栏项已存在，跳过添加", data.item.id);
            return prev;
          }
          console.log("[StatusBar] 添加新状态栏项", data.item.id);
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

      console.log("[StatusBar] 活动标签页变量", customEvent.detail);

      if (customEvent.detail) {
        const { tabType, language } = customEvent.detail;

        // 使用 React.startTransition 来优化状态更新，避免闪烁
        React.startTransition(() => {
          setCurrentTabType(tabType);

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

  // 监听索引进度事件
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.workspaceIndex?.onProgress) {
      console.warn("[StatusBar] workspaceIndex.onProgress 不可用");
      return;
    }

    console.log("[StatusBar] 开始监听索引进度事件");

    const unsubscribe = electron.workspaceIndex.onProgress(
      (
        progress: {
          totalFiles: number;
          processedFiles: number;
          currentFile?: string;
        } | null
      ) => {
        console.log("[StatusBar] 收到索引进度事件:", progress);
        setIndexingProgress(progress);
      }
    );

    return () => {
      console.log("[StatusBar] 取消监听索引进度事件");
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
        console.log("[StatusBar] 正在执行命令:", commandId);
        await ipcRenderer.invoke("plugin:execute-command", commandId);
        console.log("[StatusBar] 命令执行成功:", commandId);
      } else {
        console.error("[StatusBar] 无法执行命令，ipcRenderer 不可用");
      }
    } catch (error) {
      console.error("[StatusBar] 执行命令失败:", commandId, error);
    }
  };

  // 调试：输出状态栏项信息
  React.useEffect(() => {
    console.log("[StatusBar] ========== 状态栏项更新==========");
    console.log("[StatusBar] 数量:", pluginStatusBarItems.length);
    console.log(
      "[StatusBar] 详情:",
      JSON.stringify(pluginStatusBarItems, null, 2)
    );
    console.log("[StatusBar] ==============================");
  }, [pluginStatusBarItems]);

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
          {/* 索引进度显示 */}
          {indexingProgress && (
            <div className="status-bar-indexing">
              <Icon
                name="refresh"
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
              console.log("[StatusBar] 渲染左侧", item);
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
                  console.log("[StatusBar] 渲染右侧", item);
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
              <span className="status-bar-text">Ln 1, Col 1</span>

              {/* 文件编码 */}
              <div className="status-bar-info-btn">UTF-8</div>

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
          console.log("[StatusBar] 关闭背景图片设置面板");
          setShowBackgroundSettings(false);
        }}
      />
    </>
  );
};
