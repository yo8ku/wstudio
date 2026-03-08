/**
 * 鐘舵€佹爮缁勪欢
 * 鍔熻兘锛氭樉绀虹紪杈戝櫒鐘舵€併€佹墿灞曚俊鎭瓑
 */

import React, { useState, useEffect, useRef } from "react";
import "./StatusBar.scss";
import { BackgroundImageSettings } from "../../BackgroundImageSettings/index";
import { Icon } from "../../Icons/Icon";
import { useActivityBarStore } from "../../../stores/activityBarStore";
import { useLinkStore } from "../../../stores/linkStore";
import { useNoteStore } from "../../../stores/noteStore";
import { notification } from "../../Notification";

interface StatusBarProps {}

export const StatusBar: React.FC<StatusBarProps> = () => {
  const { sidebarPosition } = useActivityBarStore();
  const currentNote = useNoteStore((state) => state.currentNote);
  const outlinks = useLinkStore((state) => state.outlinks);
  const backlinks = useLinkStore((state) => state.backlinks);
  const loadLinks = useLinkStore((state) => state.loadLinks);
  const [pluginStatusBarItems, setPluginStatusBarItems] = useState<any[]>([]);
  const [wordCount, setWordCount] = useState<number>(0);

  // 鏂板锛氱洃鍚樉绀鸿儗鏅浘鐗囪缃潰鏉夸簨浠?
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);

  // 鏂板锛氱洃鍚綋鍓嶆爣绛鹃〉鐨勮瑷€绫诲瀷
  const [currentLanguage, setCurrentLanguage] = useState<string>("Markdown");

  // 鏂板锛氱洃鍚綋鍓嶆爣绛鹃〉绫诲瀷锛堢敤浜庡喅瀹氱姸鎬佹爮鏄剧ず鍐呭锛?
  const [currentTabType, setCurrentTabType] = useState<
    "file" | "settings" | "ai-config" | "markdown-preview" | "knowledge" | null
  >("file");

  // 宸ヤ綔鍖哄悜閲忕储寮曡繘搴︾姸鎬?
  const [vectorIndexingProgress, setVectorIndexingProgress] = useState<{
    totalFiles: number;
    processedFiles: number;
    currentFile: string | null;
    status: 'idle' | 'scanning' | 'indexing' | 'paused' | 'completed' | 'error';
    workspaceTotalFiles?: number;  // 宸ヤ綔鍖烘€绘枃浠舵暟
    indexedTotalFiles?: number;    // 宸茬储寮曞畬鎴愮殑鏂囦欢鎬绘暟
    vectorization?: {
      status: 'idle' | 'running' | 'completed';
      totalFiles: number;
      processedFiles: number;
      currentFile: string | null;
    };
  } | null>(null);

  // 绱㈠紩杩涘害鐘舵€侊紙涓昏繘绋嬬殑鏂囦欢绱㈠紩锛?
  const [indexingProgress, setIndexingProgress] = useState<{
    totalFiles: number;
    processedFiles: number;
    currentFile?: string;
  } | null>(null);


  // 鐩戝惉鏄剧ず鑳屾櫙鍥剧墖璁剧疆闈㈡澘鐨勪簨浠讹紙鍗曠嫭澶勭悊锛岄伩鍏嶉棴鍖呴棶棰橈級
  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error("[StatusBar] ========== ipcRenderer 鏈壘鍒?=========");
      console.error("[StatusBar] window.electron:", (window as any).electron);
      console.error("[StatusBar] 杩欏彲鑳芥槸鍥犱负 preload.js 娌℃湁姝ｇ‘鍔犺浇");
      return;
    }
    // 鐩戝惉鏄剧ず鑳屾櫙鍥剧墖璁剧疆闈㈡澘鐨勪簨浠?
    const handleShowBackgroundSettings = (event: any, ...args: any[]) => {
      setShowBackgroundSettings(true);
    };

    try {
      ipcRenderer.on(
        "background-image:show-settings",
        handleShowBackgroundSettings
      );

    } catch (error) {
      console.error("[StatusBar] 鉂?娉ㄥ唽浜嬩欢鐩戝惉鍣ㄥけ璐?", error);
    }

    return () => {
      try {
        ipcRenderer.removeListener(
          "background-image:show-settings",
          handleShowBackgroundSettings
        );
      } catch (error) {
        console.error("[StatusBar] 鉂?绉婚櫎浜嬩欢鐩戝惉鍣ㄥけ璐?", error);
      }
    };
  }, []); // 鍙湪缁勪欢鎸傝浇鏃舵敞鍐屼竴娆?

  // 鐩戝惉鎻掍欢绯荤粺鐨勭姸鎬佹爮椤?
  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error("[StatusBar] ========== ipcRenderer 鏈壘鍒?=========");
      console.error("[StatusBar] window.electron:", (window as any).electron);
      console.error("[StatusBar] 杩欏彲鑳芥槸鍥犱负 preload.js 娌℃湁姝ｇ‘鍔犺浇");
      return;
    }

    // 閫氱煡涓昏繘绋嬫覆鏌撹繘绋嬪凡鍑嗗灏辩华
    ipcRenderer.send("renderer:loaded");

    // 鍒濆鍖栵細鑾峰彇鎵€鏈夊凡娉ㄥ唽鐨勭姸鎬佹爮椤?
    const loadStatusBarItems = async () => {
      try {
        const items = await ipcRenderer.invoke("plugin:get-status-bar-items");
        setPluginStatusBarItems(items);
      } catch (error) {
        console.error("[StatusBar] Failed to load status bar items", error);
      }
    };

    // 绛夊緟涓昏繘绋嬪垵濮嬪寲瀹屾垚鍚庡啀鍔犺浇鐘舵€佹爮椤?
    const handleMainProcessReady = () => {
      loadStatusBarItems();
    };

    // 鐩戝惉涓昏繘绋嬪噯澶囧氨缁簨浠?
    ipcRenderer.once("main-process:ready", handleMainProcessReady);

    // 濡傛灉涓昏繘绋嬪凡缁忓氨缁紙鐑噸杞藉満鏅級锛岀洿鎺ュ姞杞?
    // 璁剧疆涓€涓煭鏆傜殑寤惰繜锛岀粰涓昏繘绋嬩竴浜涘垵濮嬪寲鏃堕棿
    const timeoutId = setTimeout(() => {
     
      loadStatusBarItems();
    }, 1000);

    const handleStatusBarItem = (event: any, data: any) => {
    
      setPluginStatusBarItems((prev) => {
        if (data.action === "add") {
          // 妫€鏌ユ槸鍚﹀凡瀛樺湪锛岄伩鍏嶉噸澶嶆坊鍔?
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

  // 鐩戝惉褰撳墠鏍囩椤佃瑷€鍙樺寲
  useEffect(() => {
    const handleTabLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ language: string }>;
      if (customEvent.detail?.language) {
        // 灏嗚瑷€绫诲瀷杞崲涓烘洿鍙嬪ソ鐨勬樉绀哄悕绉?
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

  // 鐩戝惉娲诲姩鏍囩椤电被鍨嬪彉鍖?
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

        // 浣跨敤 React.startTransition 鏉ヤ紭鍖栫姸鎬佹洿鏂帮紝閬垮厤闂儊
        React.startTransition(() => {
          setCurrentTabType(tabType);
          if (tabType !== "file") {
            setWordCount(0);
          }

          // 鍚屾椂鏇存柊璇█淇℃伅
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

  useEffect(() => {
    if (currentTabType !== "file" || !currentNote?.id) {
      return;
    }

    void loadLinks(currentNote.id);
  }, [currentNote, currentTabType, loadLinks]);

  // 闃叉閲嶅鏄剧ず瀹屾垚閫氱煡
  const hasShownCompletedRef = useRef<boolean>(false);
  // 璁板綍鏄惁鏈夋枃浠惰澶勭悊杩囷紙鐢ㄤ簬鍒ゆ柇鏄惁闇€瑕佹樉绀哄畬鎴愰€氱煡锛?
  const hasProcessedFilesRef = useRef<boolean>(false);

  // 鐩戝惉宸ヤ綔鍖哄悜閲忕储寮曟湇鍔¤繘搴︼紙閫氳繃 IPC锛?
  useEffect(() => {
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.warn("[StatusBar] IPC 涓嶅彲鐢紝鏃犳硶鐩戝惉鍚戦噺绱㈠紩杩涘害");
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
      // 褰撳紑濮嬫柊鐨勭储寮曟椂锛岄噸缃畬鎴愭爣蹇?
      if (progress.status === 'scanning' || progress.status === 'indexing') {
        hasShownCompletedRef.current = false;
        hasProcessedFilesRef.current = progress.processedFiles > 0 || progress.totalFiles > 0;
      }
      
      // 璁板綍鏄惁鏈夋枃浠惰澶勭悊
      if (progress.processedFiles > 0 || progress.totalFiles > 0) {
        hasProcessedFilesRef.current = true;
      }
      
      // 妫€娴嬪畬鎴愶細绱㈠紩瀹屾垚涓斿悜閲忓寲涔熷畬鎴愶紙鎴栨病鏈夊悜閲忓寲浠诲姟锛?
      const indexCompleted = progress.status === 'completed';
      const vectorizationCompleted = !progress.vectorization || progress.vectorization.status === 'completed';
      
      if (indexCompleted && vectorizationCompleted && 
          hasProcessedFilesRef.current && 
          !hasShownCompletedRef.current) {
        hasShownCompletedRef.current = true;
        notification.success('绱㈠紩瀹屾垚');
      }
      
      setVectorIndexingProgress(progress);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 鐩戝惉绱㈠紩杩涘害浜嬩欢锛堜富杩涚▼鐨勬枃浠剁储寮曪級
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.workspaceIndex?.onProgress) {
      console.warn("[StatusBar] workspaceIndex.onProgress is unavailable");
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

  // 鎵ц鎻掍欢鍛戒护
  const executePluginCommand = async (commandId: string) => {
    try {
      const ipcRenderer = (window as any).electron?.ipcRenderer;
      if (ipcRenderer) {
        await ipcRenderer.invoke("plugin:execute-command", commandId);
      } else {
        console.error("[StatusBar] Cannot execute plugin command: ipcRenderer unavailable");
      }
    } catch (error) {
      console.error("[StatusBar] 鎵ц鍛戒护澶辫触:", commandId, error);
    }
  };


  // 澶х翰鍥炬爣缁勪欢
  const OutlineIcon = () => (
    <div className="status-bar-info-btn" title="澶х翰">
      <svg
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
        {/* 宸︿晶锛氭墿灞曠姸鎬*/}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            height: "100%",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {/* 涓昏繘绋嬬储寮曡繘搴︽樉绀?*/}
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
              <span className="status-bar-text">姝ｅ湪鍒嗘瀽鏂囦欢...</span>
            </div>
          )}

          {/* 鎻掍欢绯荤粺鐨勭姸鎬佹爮 */}
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

          {/* 鍚戦噺绱㈠紩杩涘害鏄剧ず - 鍦ㄥぇ绾插浘鏍囧彸渚?*/}
          {vectorIndexingProgress && (vectorIndexingProgress.status === 'scanning' || vectorIndexingProgress.status === 'indexing') && (
            <div 
              className="status-bar-indexing" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}
              title={vectorIndexingProgress.currentFile || '姝ｅ湪绱㈠紩宸ヤ綔鍖烘枃浠?..'}
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
                {vectorIndexingProgress.status === 'scanning' ? 'Scanning' : 'Indexing'}
              </span>
              {/* 杩涘害鏉?- 浣跨敤鏈宸插鐞?鏈闇€瑕佺储寮曠殑鏁伴噺 */}
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
              {/* 鏄剧ず锛氭湰娆″凡澶勭悊/鏈闇€瑕佺储寮曠殑鏁伴噺 */}
              <span className="status-bar-text" style={{ fontSize: '10px', opacity: 0.7 }}>
                {vectorIndexingProgress.processedFiles ?? 0}/{vectorIndexingProgress.totalFiles ?? 0}
              </span>
            </div>
          )}

          {/* 绱㈠紩杩涘害鏄剧ず - 鍚庡彴绱㈠紩杩愯鏃舵樉绀?*/}
          {vectorIndexingProgress?.vectorization?.status === 'running' && (
            <div 
              className="status-bar-indexing" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}
              title={vectorIndexingProgress.vectorization.currentFile || '姝ｅ湪绱㈠紩...'}
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
                绱㈠紩
              </span>
              {/* 绱㈠紩杩涘害鏉?*/}
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
              {/* 鏄剧ず锛氬凡绱㈠紩/鎬绘暟 */}
              <span className="status-bar-text" style={{ fontSize: '10px', opacity: 0.6 }}>
                {vectorIndexingProgress.vectorization.processedFiles ?? 0}/{vectorIndexingProgress.vectorization.totalFiles ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* 鍙充晶锛氱紪杈戝櫒鐘舵€*/}
        <div className="status-bar-right">
          {/* 鏂囦欢鏍囩椤垫椂鏄剧ず鐨勭姸鎬佷俊鎭紙鍖呮嫭鎻掍欢椤癸級 */}
          {currentTabType === "file" && (
            <>
              {/* 鎻掍欢绯荤粺鐨勫彸渚х姸鎬佹爮 */}
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

              {currentNote && (
                <div className="status-bar-info-btn">
                  {backlinks.length}条反链 {outlinks.length}条出链
                </div>
              )}

              {/* 鍏夋爣浣嶇疆 */}
              <div className="status-bar-info-btn">瀛楁暟 {wordCount}</div>

              {/* 鏂囦欢缂栫爜 */}

              {/* 璇█妯″紡 */}
              <div className="status-bar-info-btn">{currentLanguage}</div>
            </>
          )}

          {/* 澶х翰 - 褰撲晶杈规爮鍦ㄥ彸杈规椂鏄剧ず鍦ㄥ彸杈?*/}
          {sidebarPosition === 'right' && <OutlineIcon />}

          {/* 鑳屾櫙璁剧疆 - 濮嬬粓鏄剧ず */}
          <div
            className="status-bar-info-btn"
            title="鑳屾櫙璁剧疆"
            onClick={() => setShowBackgroundSettings(true)}
          >
            <Icon
              name="background-settings"
              iconSet="ui"
              size={14}
            />
          </div>

          {/* 閫氱煡涓績 - 濮嬬粓鏄剧ず */}
          <div className="status-bar-info-btn" title="閫氱煡涓績">
            <Icon
              name="notification"
              iconSet="ui"
              size={14}
            />
          </div>

          {/* 鍙嶉 - 濮嬬粓鏄剧ず */}
          <div className="status-bar-info-btn" title="鍙嶉">
            <svg
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

      {/* 鑳屾櫙鍥剧墖璁剧疆闈㈡澘 */}
      <BackgroundImageSettings
        visible={showBackgroundSettings}
        onClose={() => {
          setShowBackgroundSettings(false);
        }}
      />
    </>
  );
};


