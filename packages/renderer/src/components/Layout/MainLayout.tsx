/**
 * 涓诲竷灞€瀹瑰櫒
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
  type WorkbenchContributionSnapshot,
} from '@note-studio/shared';
import { TitleBar } from '../TitleBar/TitleBar';
import { ActivityBar } from './ActivityBar';
import type { ActivityBarItem } from './ActivityBar/ActivityBar';
import {
  isPluginActivityBarItem,
  toPluginActivityBarItem,
} from './ActivityBar/ActivityBar';
import { Sidebar } from './Sidebar/Sidebar';
import { EditorArea } from './EditorArea/EditorArea/EditorArea';
import { StatusBar } from './StatusBar/StatusBar';
import { AIChatPanel } from './AIChatPanel/AIChatPanel';
import { BackgroundImageLayer } from './BackgroundImageLayer/BackgroundImageLayer';
import { Panel, type PanelPlacement, type PanelView } from './Panel';
import { VSCodeCommandCenter } from '../../command-center/VSCodeCommandCenter';
import { ThemeCommandProvider } from '../../command-center/ThemeCommandProvider';
import { MarkdownCommandProvider } from '../../command-center/MarkdownCommandProvider';
import { FileCommandProvider } from '../../command-center/FileCommandProvider';
import { AIConfigCommandProvider } from '../../command-center/AIConfigCommandProvider';
import { ExtensionDevelopmentCommandProvider } from '../../command-center/ExtensionDevelopmentCommandProvider';
import { PluginCommandProvider } from '../../command-center/PluginCommandProvider';
import { getGlobalCommandCenter, setGlobalCommandCenter } from '../../command-center/GlobalCommandCenter';
import { GlobalModal } from '../GlobalModal';
import { workbenchContributionService } from '../../services/WorkbenchContributionService';
import { useThemeStore } from '../../stores/themeStore';
import { useActivityBarStore } from '../../stores/activityBarStore';
import { notification } from '../Notification';
import { usePluginUiEntries } from '../../hooks/usePluginUiEntries';
import { pluginUIService } from '../../services/PluginUIService';
import { WorkspaceFileIconThemeBootstrap } from '../WorkspaceFileIcon/WorkspaceFileIconThemeBootstrap';

export type { ActivityBarItem };

interface MainLayoutProps {
  className?: string;
}

const WINDOW_BACKGROUND_FALLBACK = '#1e1e1e';
const COMMAND_CENTER_SHOW_CHANNEL = 'command-center:show';

type RGBAColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

const clampColorChannel = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, Math.round(value)));
};

const parseHexColor = (hexColor: string): RGBAColor | null => {
  const hex = hexColor.replace('#', '').trim();

  if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) {
    return null;
  }

  const normalizedHex = hex.length <= 4
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;

  const hasAlpha = normalizedHex.length === 8;
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const alpha = hasAlpha ? Number.parseInt(normalizedHex.slice(6, 8), 16) / 255 : 1;

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    red,
    green,
    blue,
    alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
  };
};

const parseRgbColor = (rgbColor: string): RGBAColor | null => {
  const match = rgbColor.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([0-9.]+))?\s*\)$/i
  );

  if (!match) {
    return null;
  }

  const alphaValue = match[4] === undefined ? 1 : Number.parseFloat(match[4]);

  return {
    red: clampColorChannel(Number.parseFloat(match[1])),
    green: clampColorChannel(Number.parseFloat(match[2])),
    blue: clampColorChannel(Number.parseFloat(match[3])),
    alpha: Number.isFinite(alphaValue) ? Math.max(0, Math.min(1, alphaValue)) : 1
  };
};

const parseCssColor = (rawColor: string): RGBAColor | null => {
  const color = rawColor.trim().toLowerCase();

  if (!color || color === 'transparent') {
    return {
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0
    };
  }

  if (color.startsWith('#')) {
    return parseHexColor(color);
  }

  if (color.startsWith('rgb')) {
    return parseRgbColor(color);
  }

  return null;
};

const toHexChannel = (value: number): string => clampColorChannel(value).toString(16).padStart(2, '0');

const toOpaqueColor = (color: RGBAColor, fallback: RGBAColor): RGBAColor => {
  const alpha = Math.max(0, Math.min(1, color.alpha));

  return {
    red: clampColorChannel(color.red * alpha + fallback.red * (1 - alpha)),
    green: clampColorChannel(color.green * alpha + fallback.green * (1 - alpha)),
    blue: clampColorChannel(color.blue * alpha + fallback.blue * (1 - alpha)),
    alpha: 1
  };
};

const getDefaultWindowBackgroundColor = (): string => (
  document.documentElement.getAttribute('data-theme-mode') === 'light'
    ? '#ffffff'
    : WINDOW_BACKGROUND_FALLBACK
);

const normalizeWindowBackgroundColor = (
  rawColor: string,
  fallbackColor = getDefaultWindowBackgroundColor()
): string => {
  const defaultFallback = parseCssColor(getDefaultWindowBackgroundColor()) ?? {
    red: 30,
    green: 30,
    blue: 30,
    alpha: 1
  };
  const parsedFallback = parseCssColor(fallbackColor);
  const opaqueFallback = parsedFallback
    ? toOpaqueColor(parsedFallback, defaultFallback)
    : defaultFallback;
  const parsedColor = parseCssColor(rawColor);
  const opaqueColor = parsedColor
    ? toOpaqueColor(parsedColor, opaqueFallback)
    : opaqueFallback;

  return `#${toHexChannel(opaqueColor.red)}${toHexChannel(opaqueColor.green)}${toHexChannel(opaqueColor.blue)}`;
};

const resolveWindowBackgroundColor = (): string => {
  const styles = getComputedStyle(document.documentElement);
  const defaultColor = getDefaultWindowBackgroundColor();
  const fallbackColor = styles.getPropertyValue('--app-bg').trim() || defaultColor;
  const candidates = [
    styles.getPropertyValue('--app-bg'),
    styles.getPropertyValue('--editor-bg'),
    styles.getPropertyValue('--ws-editor-background'),
    styles.getPropertyValue('--vscode-editor-background')
  ];

  for (const candidate of candidates) {
    if (candidate.trim()) {
      return normalizeWindowBackgroundColor(candidate, fallbackColor);
    }
  }

  return normalizeWindowBackgroundColor(defaultColor, WINDOW_BACKGROUND_FALLBACK);
};

export const MainLayout: React.FC<MainLayoutProps> = ({ className = '' }) => {
  const searchParams = new URLSearchParams(window.location.search);
  const isEditorOnlyWindow = searchParams.get('windowMode') === 'editor-only';
  const startupPanel = searchParams.get('openPanel');
  const shouldOpenPanelOnStartup = startupPanel === 'terminal' || startupPanel === 'timeline' || startupPanel === 'links';
  const initialPanelView: PanelView =
    startupPanel === 'timeline'
      ? 'timeline'
      : startupPanel === 'links'
        ? 'links'
        : 'terminal';
  const [activeActivity, setActiveActivity] = useState<ActivityBarItem>('explorer');
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isAIChatVisible, setIsAIChatVisible] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(shouldOpenPanelOnStartup);
  const [panelActiveView, setPanelActiveView] = useState<PanelView>(initialPanelView);
  const [panelPosition, setPanelPosition] = useState<PanelPlacement>('bottom');
  const [aiChatPanelPosition, setAIChatPanelPosition] = useState<'right' | 'left'>('right'); // AI Chat Panel 浣嶇疆
  const [workbenchContributions, setWorkbenchContributions] = useState<WorkbenchContributionSnapshot>(
    EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
  );

  const handleToggleTerminalPanel = () => {
    if (panelActiveView === 'terminal') {
      setIsPanelVisible((previous) => !previous);
      return;
    }

    setPanelActiveView('terminal');
    setIsPanelVisible(true);
  };

  // 鑾峰彇鍙充晶娲诲姩鏍忕殑鏄剧ず鐘舵€?
  // 鑾峰彇涓讳晶鏍忎綅缃?
  const { sidebarPosition, setSidebarPosition } = useActivityBarStore();
  
  // 鍏ㄥ眬鍛戒护涓績
  const commandCenterRef = useRef<VSCodeCommandCenter | null>(null);
  const themeProviderRef = useRef<ThemeCommandProvider | null>(null);
  const markdownProviderRef = useRef<MarkdownCommandProvider | null>(null);
  const fileProviderRef = useRef<FileCommandProvider | null>(null);
  const aiConfigProviderRef = useRef<AIConfigCommandProvider | null>(null);
  const extensionDevelopmentProviderRef = useRef<ExtensionDevelopmentCommandProvider | null>(null);
  const pluginCommandProviderRef = useRef<PluginCommandProvider | null>(null);
  const panelRevealTokensRef = useRef(new Map<string, number>());
  const openCommandCenter = useCallback((): void => {
    void commandCenterRef.current?.show('>');
  }, []);
  const pluginUiEntries = usePluginUiEntries('activityBar');
  const pluginActivityItems = useMemo(
    () => {
      const containerItems = workbenchContributions.viewContainers.map(container => ({
        id: toPluginActivityBarItem(container.containerKey),
        title: container.title,
        iconPath: container.icon,
      }));
      const entryItems = pluginUiEntries.map(entry => ({
        id: toPluginActivityBarItem(`entry:${entry.id}`),
        title: entry.title,
        iconPath: null,
        iconName: entry.icon,
        iconSvg: entry.iconSvg,
        onClick: () => {
          void pluginUIService.executeEntry(entry.id).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            notification.error(`执行插件入口失败: ${message}`);
          });
        },
      }));

      return [...containerItems, ...entryItems];
    },
    [pluginUiEntries, workbenchContributions.viewContainers],
  );

  const loadWorkbenchContributions = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await workbenchContributionService.getContributions();
      setWorkbenchContributions(snapshot);
    } catch (error) {
      console.error('[MainLayout] 加载插件工作台贡献失败:', error);
      setWorkbenchContributions(EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT);
      notification.error('加载插件工作台视图失败');
    }
  }, []);

  const handleActivityClick = (activity: ActivityBarItem) => {
    if (activity === 'settings') {
      // 鐐瑰嚮璁剧疆鏃讹紝闅愯棌渚ц竟鏍忓苟瑙﹀彂鎵撳紑璁剧疆浜嬩欢锛堢敱 EditorArea 澶勭悊锛?
      setIsSidebarVisible(false);
      window.dispatchEvent(new Event('open-settings'));
      return;
    }

    if (activity === 'media') {
      // 鐐瑰嚮绱犳潗绠＄悊鏃讹紝鎵撳紑鏍囩椤佃€屼笉鏄晶杈规爮
      window.dispatchEvent(new Event('open-media-panel'));
      return;
    }

    if (activeActivity === activity) {
      // 濡傛灉鐐瑰嚮褰撳墠娲诲姩鐨勯」锛屽垏鎹晶杈规爮鍙鎬?
      setIsSidebarVisible(!isSidebarVisible);
    } else {
      // 鍒囨崲鍒版柊鐨勬椿鍔ㄩ」骞舵樉绀轰晶杈规爮
      setActiveActivity(activity);
      setIsSidebarVisible(true);
    }
  };

  const handleAIChatMoveLeft = () => {
    setAIChatPanelPosition('left');
    setSidebarPosition('right');
  };

  const handleAIChatMoveRight = () => {
    setAIChatPanelPosition('right');
    setSidebarPosition('left');
  };

  // 涓讳晶鏍忎綅缃彉鍖栨椂锛孉I panel 鑷姩绉诲埌鐩稿弽渚?
  useEffect(() => {
    setAIChatPanelPosition(sidebarPosition === 'left' ? 'right' : 'left');
  }, [sidebarPosition]);

  // 鐩戝惉鎵撳紑搴曢儴闈㈡澘浜嬩欢
  useEffect(() => {
    if (isEditorOnlyWindow) {
      return undefined;
    }

    const handleOpenPanel = (event: Event) => {
      const customEvent = event as CustomEvent<{ view?: PanelView }>;
      const view = customEvent.detail?.view || 'terminal';
      
      console.log('[MainLayout] 鎵撳紑搴曢儴闈㈡澘:', view);
      setPanelActiveView(view);
      setIsPanelVisible(true);
    };

    window.addEventListener('open-panel', handleOpenPanel);
    return () => {
      window.removeEventListener('open-panel', handleOpenPanel);
    };
  }, [isEditorOnlyWindow]);

  // 鐩戝惉浠庢爣绛鹃〉杩樺師 AI 闈㈡澘鍒颁晶杈规爮
  useEffect(() => {
    if (isEditorOnlyWindow) {
      return undefined;
    }

    const handleRestoreAIChatPanel = () => {
      setIsAIChatVisible(true);
    };

    window.addEventListener('restore-ai-chat-panel', handleRestoreAIChatPanel);
    return () => {
      window.removeEventListener('restore-ai-chat-panel', handleRestoreAIChatPanel);
    };
  }, [isEditorOnlyWindow]);

  // 鍒濆鍖栦富棰樼郴缁?
  const initializeTheme = useThemeStore((state) => state.initialize);
  const currentTheme = useThemeStore((state) => state.currentTheme);
  
  useEffect(() => {
    console.log('[MainLayout] 鍒濆鍖栦富棰樼郴缁?..');
    initializeTheme().catch((error) => {
      console.error('[MainLayout] 涓婚绯荤粺鍒濆鍖栧け璐?', error);
    });
  }, [initializeTheme]);

  // 鍦ㄦ牴鍏冪礌娣诲姞涓婚鏍囪瘑锛坙ight 鎴?dark锛?
  useEffect(() => {
    if (currentTheme) {
      const themeMode = currentTheme.type; // 'light' 鎴?'dark'
      document.documentElement.setAttribute('data-theme-mode', themeMode);
      console.log(`[MainLayout] 鏍瑰厓绱犱富棰樻爣璇嗗凡璁剧疆: data-theme-mode="${themeMode}"`);
    }
  }, [currentTheme]);

  useEffect(() => {
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) {
      return;
    }

    let frameId = 0;
    const syncWindowBackgroundColor = () => {
      frameId = window.requestAnimationFrame(() => {
        const backgroundColor = resolveWindowBackgroundColor();

        void ipcRenderer.invoke('window:set-background-color', backgroundColor).catch((error) => {
          console.error('[MainLayout] 鍚屾绐楀彛鑳屾櫙鑹插け璐?', error);
        });
      });
    };

    syncWindowBackgroundColor();

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [currentTheme]);

  useEffect(() => {
    let resizeTimeoutId: number | null = null;
    const ipcRenderer = window.electron?.ipcRenderer;

    const setResizingState = (isResizing: boolean) => {
      document.body.classList.toggle('window-resizing', isResizing);
    };

    const scheduleClearResizingState = () => {
      if (resizeTimeoutId !== null) {
        window.clearTimeout(resizeTimeoutId);
      }

      resizeTimeoutId = window.setTimeout(() => {
        setResizingState(false);
        resizeTimeoutId = null;
      }, 180);
    };

    const handleResizeActivity = () => {
      setResizingState(true);
      scheduleClearResizingState();
    };

    const removeResizeStateListener = ipcRenderer?.on?.('window:resize-state-changed', (_event, isResizing) => {
      if (isResizing) {
        handleResizeActivity();
        return;
      }

      if (resizeTimeoutId !== null) {
        window.clearTimeout(resizeTimeoutId);
        resizeTimeoutId = null;
      }

      setResizingState(false);
    });

    window.addEventListener('resize', handleResizeActivity);

    return () => {
      window.removeEventListener('resize', handleResizeActivity);
      removeResizeStateListener?.();
      if (resizeTimeoutId !== null) {
        window.clearTimeout(resizeTimeoutId);
      }
      setResizingState(false);
    };
  }, []);

  // 鍒濆鍖栧伐浣滃尯鍚庡彴绱㈠紩鏈嶅姟锛堜娇鐢ㄥ弻 Worker Thread锛屼笉闃诲 UI锛?
  useEffect(() => {
    if (isEditorOnlyWindow) {
      return undefined;
    }

    const initWorkspaceIndexing = async () => {
      try {
        console.log('[MainLayout] 鍒濆鍖栧伐浣滃尯鍚庡彴绱㈠紩鏈嶅姟...');

        const ipcRenderer = window.electron?.ipcRenderer;
        if (!ipcRenderer) {
          console.warn('[MainLayout] IPC 涓嶅彲鐢紝璺宠繃绱㈠紩');
          return;
        }

        // 绛夊緟涓昏繘绋嬪氨缁?
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

        console.log('[MainLayout] 涓昏繘绋嬪凡灏辩华');

        // 濮嬬粓鐩戝惉杩涘害鏇存柊锛堟棤璁烘槸鑷姩绱㈠紩杩樻槸鎵嬪姩绱㈠紩锛?
        // 浣跨敤 preload 鏆撮湶鐨勪笓鐢?API锛屽洖璋冨彧鎺ユ敹 progress 鍙傛暟
        let lastErrorMessage = ''; // 闃叉閲嶅鏄剧ず鐩稿悓閿欒
        const unsubscribe = window.electron?.workspaceVectorIndex?.onProgress((progress: { status: string; processedFiles?: number; totalFiles?: number; errorMessage?: string }) => {
          if (progress.status === 'scanning') {
            console.log('[WorkspaceIndexing] 姝ｅ湪鎵弿鏂囦欢...');
          } else if (progress.status === 'indexing') {
            console.log('[WorkspaceIndexing] 进度: ' + progress.processedFiles + '/' + progress.totalFiles);
          } else if (progress.status === 'completed') {
            console.log('[WorkspaceIndexing] 绱㈠紩瀹屾垚');
            lastErrorMessage = ''; // 閲嶇疆閿欒鐘舵€?
            // 鎴愬姛閫氱煡鐢?StatusBar 缁勪欢澶勭悊锛岄伩鍏嶉噸澶?
          } else if (progress.status === 'error') {
            const errorMsg = progress.errorMessage || '鏈煡閿欒';
            // 闃叉閲嶅鏄剧ず鐩稿悓閿欒
            if (errorMsg !== lastErrorMessage) {
              lastErrorMessage = errorMsg;
              console.error('[WorkspaceIndexing] 绱㈠紩閿欒:', errorMsg);
              // 鏄剧ず閿欒閫氱煡
              notification.error(errorMsg);
            }
          }
        });

        // 鑾峰彇宸ヤ綔鍖鸿矾寰?
        const workspaceResult = await window.electron?.workspace?.getDir();
        if (!workspaceResult?.success || !workspaceResult.data) {
          console.warn('[MainLayout] 鏃犳硶鑾峰彇宸ヤ綔鍖鸿矾寰勶紝璺宠繃绱㈠紩');
          return () => {
            if (unsubscribe) unsubscribe();
          };
        }

        const workspacePath = workspaceResult.data;

        console.log('[MainLayout] 检查自动索引配置: ' + workspacePath);

        // 浣跨敤鑷姩绱㈠紩妫€鏌ワ紙浼氭鏌ワ細鑷储寮曞紑鍏炽€佹湇鍔″晢銆佹ā鍨嬨€丄PI Key锛?
        const result = await window.electron?.workspaceVectorIndex?.checkAutoIndex(workspacePath);
        if (!result?.success) {
          console.log('[MainLayout] 鑷姩绱㈠紩妫€鏌?', result?.data?.message || result?.error);
        }

        return () => {
          if (unsubscribe) unsubscribe();
        };
      } catch (error) {
        console.error('[MainLayout] 宸ヤ綔鍖虹储寮曟湇鍔″垵濮嬪寲澶辫触:', error);
      }
    };

    initWorkspaceIndexing();

    return () => {
      window.electron?.ipcRenderer?.invoke('workspace-vector-index:stop').catch(() => {});
    };
  }, [isEditorOnlyWindow]);

  // 鍒濆鍖栧叏灞€鍛戒护涓績
  useEffect(() => {
    if (isEditorOnlyWindow) {
      return undefined;
    }

    void loadWorkbenchContributions();
    const unsubscribe = workbenchContributionService.subscribe((snapshot) => {
      setWorkbenchContributions(snapshot);
    });

    return () => {
      unsubscribe();
    };
  }, [isEditorOnlyWindow, loadWorkbenchContributions]);

  useEffect(() => {
    if (!isPluginActivityBarItem(activeActivity)) {
      return;
    }

    const stillExists = pluginActivityItems.some(item => item.id === activeActivity);
    if (!stillExists) {
      setActiveActivity('explorer');
    }
  }, [activeActivity, pluginActivityItems]);

  useEffect(() => {
    if (isEditorOnlyWindow) {
      return;
    }

    const currentPanels = workbenchContributions.runtimeWebviewPanels;
    const revealTokens = panelRevealTokensRef.current;
    let nextFocusedPanelKey: string | null = null;

    for (const panel of currentPanels) {
      const previousRevealToken = revealTokens.get(panel.panelInstanceKey);
      if (previousRevealToken === undefined || panel.revealToken > previousRevealToken) {
        nextFocusedPanelKey = panel.panelInstanceKey;
      }

      revealTokens.set(panel.panelInstanceKey, panel.revealToken);
    }

    for (const panelInstanceKey of Array.from(revealTokens.keys())) {
      const stillExists = currentPanels.some(panel => panel.panelInstanceKey === panelInstanceKey);
      if (!stillExists) {
        revealTokens.delete(panelInstanceKey);
      }
    }

    if (nextFocusedPanelKey) {
      setPanelActiveView(`plugin-webview:${nextFocusedPanelKey}` as PanelView);
      setIsPanelVisible(true);
    }
  }, [isEditorOnlyWindow, workbenchContributions.runtimeWebviewPanels]);

  useEffect(() => {
    if (isEditorOnlyWindow) {
      return;
    }

    if (!panelActiveView.startsWith('plugin-webview:')) {
      return;
    }

    const activePanelInstanceKey = panelActiveView.slice('plugin-webview:'.length);
    const stillExists = workbenchContributions.runtimeWebviewPanels.some(
      panel => panel.panelInstanceKey === activePanelInstanceKey,
    );
    if (!stillExists) {
      setPanelActiveView('terminal');
    }
  }, [isEditorOnlyWindow, panelActiveView, workbenchContributions.runtimeWebviewPanels]);

  useEffect(() => {
    if (isEditorOnlyWindow) {
      return undefined;
    }

    console.log('[MainLayout] 鍒濆鍖栧叏灞€鍛戒护涓績...');
    const commandCenter = getGlobalCommandCenter() ?? new VSCodeCommandCenter();
    commandCenterRef.current = commandCenter;
    setGlobalCommandCenter(commandCenter);
    themeProviderRef.current = new ThemeCommandProvider(commandCenter);
    markdownProviderRef.current = new MarkdownCommandProvider(commandCenter);
    fileProviderRef.current = new FileCommandProvider(commandCenter);
    aiConfigProviderRef.current = new AIConfigCommandProvider(commandCenter);
    extensionDevelopmentProviderRef.current = new ExtensionDevelopmentCommandProvider(commandCenter);
    pluginCommandProviderRef.current = new PluginCommandProvider(commandCenter);
    
    // 绛夊緟鍛戒护鎻愪緵鑰呭垵濮嬪寲瀹屾垚
    Promise.all([
      pluginCommandProviderRef.current.ensureInitialized(),
    ]).then(() => {
      console.log('[MainLayout] 全局命令中心初始化完成');
    }).catch(error => {
      console.error('[MainLayout] 鍛戒护鎻愪緵鑰呭垵濮嬪寲澶辫触:', error);
    });

    return () => {
      if (getGlobalCommandCenter() === commandCenter) {
        setGlobalCommandCenter(null);
      }

      themeProviderRef.current?.dispose();
      pluginCommandProviderRef.current?.dispose();
      commandCenter.dispose();
      commandCenterRef.current = null;
      themeProviderRef.current = null;
      markdownProviderRef.current = null;
      fileProviderRef.current = null;
      aiConfigProviderRef.current = null;
      extensionDevelopmentProviderRef.current = null;
      pluginCommandProviderRef.current = null;
    };
  }, [isEditorOnlyWindow]);

  useEffect(() => {
    if (isEditorOnlyWindow) {
      return undefined;
    }

    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) {
      return undefined;
    }

    const unsubscribe = ipcRenderer.on(COMMAND_CENTER_SHOW_CHANNEL, () => {
      console.log('[MainLayout] 收到主进程命令中心打开请求');
      openCommandCenter();
    });

    return () => {
      unsubscribe?.();
    };
  }, [isEditorOnlyWindow, openCommandCenter]);

  // 鐩戝惉蹇嵎閿?
  useEffect(() => {
    if (isEditorOnlyWindow) {
      return undefined;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 - 鎵撳紑鍛戒护闈㈡澘
      if (e.key === 'F1') {
        e.preventDefault();
        console.log('[MainLayout] F1 閿寜涓嬶紝鎵撳紑鍛戒护闈㈡澘');
        openCommandCenter();
        return;
      }

      // Ctrl+Shift+P - 鎵撳紑鍛戒护闈㈡澘锛堝鐢ㄥ揩鎹烽敭锛?
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        console.log('[MainLayout] Ctrl+Shift+P 鎸変笅锛屾墦寮€鍛戒护闈㈡澘');
        openCommandCenter();
        return;
      }

      // Ctrl+, 鎵撳紑璁剧疆
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setIsSidebarVisible(false);
        window.dispatchEvent(new Event('open-settings'));
      }

      // Ctrl+Backquote 切换面板显示/隐藏
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        handleToggleTerminalPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleTerminalPanel, isEditorOnlyWindow, isPanelVisible, openCommandCenter]);

  // 浣跨敤 useMemo 浼樺寲鏍峰紡瀵硅薄锛岄伩鍏嶆瘡娆℃覆鏌撻兘鍒涘缓鏂板璞?
  const mainLayoutStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'transparent',
    overflow: 'hidden' as const,
    position: 'relative' as const,
    isolation: 'isolate' as const
  }), []);

  const isPanelHorizontal = panelPosition === 'top' || panelPosition === 'bottom';
  const isTerminalPanelOpen = !isEditorOnlyWindow && isPanelVisible && panelActiveView === 'terminal';

  return (
    <>
      <div
        className={`main-layout ${className}${isEditorOnlyWindow ? ' editor-only-window' : ''}`}
        style={mainLayoutStyle}
      >
        <BackgroundImageLayer />
        <WorkspaceFileIconThemeBootstrap themes={workbenchContributions.fileIconThemes} />

        {/* 鏍囬鏍忥紙鍖呭惈鑿滃崟鏍忥級 */}
        <div
          className='titleBar'
          style={{ flexShrink: 0, height: '32px', position: 'relative', zIndex: 1100, overflow: 'visible' }}
        >
          <TitleBar 
            onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
            onToggleAIPanel={() => setIsAIChatVisible(!isAIChatVisible)}
            onTogglePanel={handleToggleTerminalPanel}
            isSidebarOpen={isSidebarVisible}
            isTerminalPanelOpen={isTerminalPanelOpen}
            windowMode={isEditorOnlyWindow ? 'editor-only' : 'full'}
          />
        </div>
        
        {/* 涓诲唴瀹瑰尯 */}
        <div 
          className="main-content" 
          style={{ 
            flex: 1, 
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1,
            minHeight: 0
          }}
        >
          {/* 宸︿晶涓讳晶鏍忥紙ActivityBar + Sidebar锛? 褰?sidebarPosition === 'left' 鏃舵樉绀?*/}
          {!isEditorOnlyWindow && (
            <div className='left-ActivityBar' 
              style={{ 
              display: sidebarPosition === 'left' ? 'flex' : 'none', 
                order: 0,
                height: '100%',
                flexShrink: 0
              }}
            >
              {/* 娲诲姩鏍?*/}
              <div className='activity-bar' style={{ flexShrink: 0, width: '48px', height: '100%', position: 'relative' }}>
                <ActivityBar 
                  activeItem={activeActivity}
                  onActivityClick={handleActivityClick}
                  additionalItems={pluginActivityItems}
                />
              </div>
              
              {/* 渚ц竟鏍?*/}
              {isSidebarVisible && (
                <Sidebar 
                  activeView={activeActivity}
                  onClose={() => setIsSidebarVisible(false)}
                  workbenchContributions={workbenchContributions}
                />
              )}

              <div className='left-ActivityBar-border'>

              </div>
            </div>
          )}

            {/*END 宸︿晶涓讳晶鏍忥紙ActivityBar + Sidebar锛? 褰?sidebarPosition === 'left' 鏃舵樉绀?*/}
          
          {/* 缂栬緫鍣ㄥ尯鍩熷拰搴曢儴闈㈡澘瀹瑰櫒 */}
          <div 
            style={{ 
              flex: 1, 
              height: '100%', 
              overflow: 'hidden', 
              minWidth: 0, 
              minHeight: 0,
              position: 'relative',
              display: 'flex',
              flexDirection: isPanelHorizontal ? 'column' : 'row',
              borderRight: isEditorOnlyWindow ? 'none' : '1px solid var(--ws-titleBar-border)',
              order: (() => {
                // AI Chat 鍦ㄥ乏渚ф椂锛岀紪杈戝櫒鍦ㄥ彸杈?
                if (aiChatPanelPosition === 'left') return 2;
                // AI Chat 鍦ㄥ彸渚ф椂锛岀紪杈戝櫒鍦ㄥ乏杈?
                return 1;
              })()
            }}
          >
            {/* 缂栬緫鍣ㄥ尯鍩?*/}
            {!isEditorOnlyWindow && isPanelVisible && (panelPosition === 'top' || panelPosition === 'left') && (
              <Panel
                activeView={panelActiveView}
                placement={panelPosition}
                onPlacementChange={setPanelPosition}
                onClose={() => setIsPanelVisible(false)}
                runtimeWebviewPanels={workbenchContributions.runtimeWebviewPanels}
              />
            )}

            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
              <EditorArea />
            </div>

            {/* 搴曢儴闈㈡澘 */}
            {!isEditorOnlyWindow && isPanelVisible && (panelPosition === 'bottom' || panelPosition === 'right') && (
              <Panel
                activeView={panelActiveView}
                placement={panelPosition}
                onPlacementChange={setPanelPosition}
                onClose={() => setIsPanelVisible(false)}
                runtimeWebviewPanels={workbenchContributions.runtimeWebviewPanels}
              />
            )}
          </div>

          {/* AI 瀵硅瘽闈㈡澘 */}
          {!isEditorOnlyWindow && isAIChatVisible && (
            <div
              className='ai-chat-panel-right-border'
              style={{
                order: (() => {
                  // 濡傛灉涓讳晶鏍忓拰 AI Chat 鍦ㄥ悓涓€渚э紝AI Chat 鍦ㄤ富渚ф爮鍐呬晶
                  if (sidebarPosition === 'left' && aiChatPanelPosition === 'left') return 1;
                  if (sidebarPosition === 'right' && aiChatPanelPosition === 'right') return 2;
                  // 濡傛灉鍦ㄤ笉鍚屼晶
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

          {/* 鍙充晶涓讳晶鏍忥紙Sidebar + ActivityBar锛? 褰?sidebarPosition === 'right' 鏃舵樉绀?*/}
          {!isEditorOnlyWindow && (
            <div className='right-ActivityBar' style={{ 
            display: sidebarPosition === 'right' ? 'flex' : 'none', 
              order: 3,
              height: '100%',
              flexShrink: 0
            }}>
              {/* 渚ц竟鏍?*/}
              {isSidebarVisible && (
                <Sidebar 
                  activeView={activeActivity}
                  onClose={() => setIsSidebarVisible(false)}
                  workbenchContributions={workbenchContributions}
                />
              )}
              
              {/* 娲诲姩鏍?*/}
              <div style={{ flexShrink: 0, width: '48px', height: '100%', position: 'relative' }}>
                <ActivityBar 
                  activeItem={activeActivity}
                  onActivityClick={handleActivityClick}
                  additionalItems={pluginActivityItems}
                />
              </div>
            </div>
          )}

          {/* 鍙充晶杈规爮 */}
          {/* 鍙充晶娲诲姩鏍?- 鏍规嵁鐘舵€佹樉绀洪殣钘?*/}
        </div>
        
        {/* 鐘舵€佹爮 */}
        {!isEditorOnlyWindow && (
        <div className='StatusBar' style={{ 
          backgroundColor:'var(--ws-statusBar-background)',
          color: 'var(--ws-statusBar-foreground)',
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
        )}
      </div>

      {/* 鍏ㄥ眬妯℃€佺獥鍙?*/}
      <GlobalModal />
    </>
  );
};
