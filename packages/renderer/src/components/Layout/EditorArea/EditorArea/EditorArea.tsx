/**
 * 缂栬緫鍣ㄥ尯鍩熷鍣?
 * 鍔熻兘锛氱鐞嗙紪杈戝櫒鏍囩椤点€佹枃浠朵繚瀛樺拰蹇嵎閿?
 * 鎻忚堪锛氭彁渚涙枃浠剁紪杈戙€佷繚瀛樸€侀瑙堢瓑鏍稿績鍔熻兘
 */

// 椤跺眰鏃ュ織 - 妯″潡鍔犺浇鏃剁珛鍗虫墽琛?
console.log('========================================');
console.log('[EditorArea 妯″潡] 鏂囦欢琚姞杞斤紒');
console.log('========================================');

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as jsonc from 'jsonc-parser';
import { TabBar } from '../TabBar';
import { Breadcrumb } from '../Breadcrumb';
import { EditorGroup } from '../EditorGroup';
import { SettingsView } from '../../../Settings/SettingsView';
import { MarkdownPreview } from '../../../Editor/MarkdownPreview';
import { KnowledgeBaseView } from '../KnowledgeBaseView';
import { AIConfigView } from '../../../AIConfig/AIConfigView';
import { ExtensionManagerView } from '../ExtensionManagerView';
import { ResizableDivider } from '../ResizableDivider';
import { LanceDBView } from '../LanceDBView';
import { TableDesigner } from '../TableDesigner';
import { CodeMirrorEditor } from '../../../NoteEditor/CodeMirrorEditor';
import { MermaidDesigner } from '../../../NoteEditor/Mermaid/MermaidDesigner';
import { SkillsMarketView } from '../SkillsMarketView';
import { DecompositionRulesView } from '../DecompositionRulesView';
import { PromptManagementView } from '../PromptManagementView';
import { AIChatPanel } from '../../AIChatPanel/AIChatPanel';
import { MediaPanel } from '../../Sidebar/MediaPanel';
import { TerminalSessionView } from '../../Panel/TerminalPanel/TerminalPanel';
import type { TerminalSession } from '../../Panel/TerminalPanel/TerminalSession';
import { htmlToMarkdown, markdownToHtml, isHtmlContent } from '../../../NoteEditor/utils/formatConverter';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';
import { saveAndRemoveTableDataService } from '../../../../services/tableData';
import type { KnowledgeItem } from '../../Sidebar/KnowledgeBase/types';
import { toastService } from '../../../../services/ToastService';
import { useLinkStore } from '../../../../stores/linkStore';
import { useNoteStore } from '../../../../stores/noteStore';
import { getNoteByPath, isLinkableFile, upsertNoteByPath } from '../../../../utils/noteLinking';
import './EditorArea.scss';

export interface EditorTab {
  id: string;
  title: string;
  path: string;
  isDirty: boolean;
  language?: string;
  content?: string;
  type?: 'file' | 'settings' | 'markdown-preview' | 'knowledge' | 'ai-config' | 'extension-manager' | 'lancedb-view' | 'table-designer' | 'mermaid-designer' | 'skills-market' | 'decomposition-rules' | 'prompt-management' | 'media' | 'ai-chat' | 'terminal';
  isPreview?: boolean;  // 鏂板锛氭槸鍚︿负棰勮妯″紡锛堝崟鍑绘墦寮€锛?
  sourceTabId?: string;  // 鏂板锛氶瑙堟爣绛鹃〉鍏宠仈鐨勬簮鏂囦欢鏍囩椤礗D
  splitSourceTabId?: string;  // 分屏标签关联的源文件标签页 ID
  knowledgeData?: { id: string; items: KnowledgeItem[]; description?: string };  // 鐭ヨ瘑搴撴暟鎹紙鐢ㄤ簬 knowledge 绫诲瀷锛?
  configId?: string;  // 鏂板锛欰I閰嶇疆ID锛堢敤浜?ai-config 绫诲瀷锛屼紭鍏堜娇鐢ㄦ瀛楁锛?
  configIndex?: number;  // 宸插簾寮冿細AI閰嶇疆绱㈠紩锛堢敤浜?ai-config 绫诲瀷锛屼繚鐣欑敤浜庡悜鍚庡吋瀹癸級
  mermaidData?: { code: string; title: string };  // Mermaid 娴佺▼鍥炬暟鎹紙鐢ㄤ簬 mermaid-designer 绫诲瀷锛?
  formId?: string;  // 琛ㄥ崟ID锛堢敤浜?table-designer 绫诲瀷锛?
  decompositionRulesData?: {
    rules: Array<{
      id: string;
      name: string;
      instruction: string;
      enabled: boolean;
      builtin: boolean;
    }>;
    writingRuleDocuments?: Array<{
      id: string;
      name: string;
      path: string;
      enabled: boolean;
    }>;
  };
  diffPreview?: {
    beforeContent: string;
    afterContent: string;
    updatedAt: number;
  };
  terminalData?: {
    session: TerminalSession;
    accentColor?: string | null;
  };
}

interface EditorAreaProps {
  className?: string;
}

type EditorTabsChangeReason = 'open' | 'close' | 'switch' | 'update';
type SplitDirection = 'horizontal' | 'vertical';
type EditorPaneId = 'left-top' | 'left-bottom' | 'right-top' | 'right-bottom';
type PaneDropPlacement = 'full' | 'left' | 'right' | 'top' | 'bottom';
type PaneMoveDirection = 'left' | 'right' | 'up' | 'down';

const TAB_DRAG_MIME = 'application/x-note-studio-tab';

interface EditorTabsStateItem {
  id: string;
  title: string;
  path: string;
  type?: EditorTab['type'];
  isPreview?: boolean;
}

interface EditorTabsStateDetail {
  reason: EditorTabsChangeReason;
  tabs: EditorTabsStateItem[];
  activeTabId: string | null;
}

interface ReplaceActiveTabContentDetail {
  content: string;
  path?: string;
  name?: string;
  markDirty?: boolean;
  diffPreview?: EditorTab['diffPreview'];
}

interface UpdateActiveTabTitleDetail {
  title?: string;
}

interface OpenTerminalTabDetail {
  id?: string;
  title?: string;
  path?: string;
  terminalSession: TerminalSession;
  accentColor?: string | null;
}

interface LastOpenedFileDescriptor {
  path?: string;
  content?: string;
  name?: string;
  language?: string;
}

interface LastOpenedRestoreResult {
  success: boolean;
  data?: string | LastOpenedFileDescriptor;
  error?: string;
}

const normalizeComparableFilePath = (value: string): string =>
  value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const getFileNameFromPath = (value: string): string => {
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || value;
};

const resolveLastOpenedPath = (result: LastOpenedRestoreResult | undefined): string | null => {
  if (!result?.success || result.data === undefined) {
    return null;
  }

  if (typeof result.data === 'string') {
    const normalizedPath = result.data.trim();
    return normalizedPath || null;
  }

  const normalizedPath = typeof result.data.path === 'string' ? result.data.path.trim() : '';
  return normalizedPath || null;
};

const pushTabIdToHistory = (history: string[], tabId: string): string[] =>
  [...history.filter(id => id !== tabId), tabId];

const removeTabIdFromHistory = (history: string[], tabId: string): string[] =>
  history.filter(id => id !== tabId);

const getMostRecentTabId = (history: string[], currentTabs: EditorTab[]): string | null => {
  const currentTabIds = new Set(currentTabs.map(tab => tab.id));
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const tabId = history[index];
    if (currentTabIds.has(tabId)) {
      return tabId;
    }
  }
  return currentTabs[0]?.id ?? null;
};

const buildExtraSplitTabId = (paneId: string): string => `extra-split-${paneId}`;

export const EditorArea: React.FC<EditorAreaProps> = ({ className = '' }) => {
  console.log('========================================');
  console.log('[EditorArea 组件] 组件函数被调用（渲染）');
  console.log('========================================');
  
  // 宸︿晶缂栬緫鍣ㄧ粍
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  
  // 鍙充晶缂栬緫鍣ㄧ粍锛堢敤浜庡垎鍓茶鍥撅級
  const [rightTabs, setRightTabs] = useState<EditorTab[]>([]);
  const [rightActiveTabId, setRightActiveTabId] = useState<string | null>(null);
  const [leftBottomTabs, setLeftBottomTabs] = useState<EditorTab[]>([]);
  const [leftBottomActiveTabId, setLeftBottomActiveTabId] = useState<string | null>(null);
  const [rightBottomTabs, setRightBottomTabs] = useState<EditorTab[]>([]);
  const [rightBottomActiveTabId, setRightBottomActiveTabId] = useState<string | null>(null);
  const [extraRightSplitPanes, setExtraRightSplitPanes] = useState<Array<{ id: string; sourcePath: string }>>([]);
  const [focusedPaneId, setFocusedPaneId] = useState<EditorPaneId>('left-top');
  const [draggingTab, setDraggingTab] = useState<{ tabId: string; sourcePaneId: EditorPaneId } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ paneId: EditorPaneId; placement: PaneDropPlacement } | null>(null);
  
  // 鍒嗗壊瑙嗗浘鏄惁婵€娲?
  const [isSplitView, setIsSplitView] = useState(false);
  const [leftVerticalSplit, setLeftVerticalSplit] = useState(false);
  const [rightVerticalSplit, setRightVerticalSplit] = useState(false);
  
  // 宸︿晶缂栬緫鍣ㄧ粍瀹藉害锛堝儚绱狅級
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [leftTopHeight, setLeftTopHeight] = useState<number | null>(null);
  const [rightTopHeight, setRightTopHeight] = useState<number | null>(null);
  const [rightColumnWidths, setRightColumnWidths] = useState<Record<string, number>>({});
  const [hasCustomizedHorizontalSplit, setHasCustomizedHorizontalSplit] = useState(false);

  // 璺熻釜鍝簺閰嶇疆鏍囩椤垫湁鏈繚瀛樼殑鏇存敼
  const [unsavedConfigTabs, setUnsavedConfigTabs] = useState<Set<string>>(new Set());

  // 缂栬緫鍣ㄧ被鍨嬬姸鎬侊細'monaco' | 'codemirror'
  const [editorType, setEditorType] = useState<'monaco' | 'codemirror'>('monaco');
  const editorGroupsRef = useRef<HTMLDivElement | null>(null);
  const previousTabsLengthRef = useRef<number>(0);
  const previousActiveTabIdRef = useRef<string | null>(null);
  const tabChangeReasonOverrideRef = useRef<EditorTabsChangeReason | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const rightActiveTabIdRef = useRef<string | null>(null);
  const leftBottomActiveTabIdRef = useRef<string | null>(null);
  const rightBottomActiveTabIdRef = useRef<string | null>(null);
  const focusedPaneIdRef = useRef<EditorPaneId>('left-top');
  const tabsRef = useRef<EditorTab[]>([]);
  const rightTabsRef = useRef<EditorTab[]>([]);
  const leftBottomTabsRef = useRef<EditorTab[]>([]);
  const rightBottomTabsRef = useRef<EditorTab[]>([]);
  const composingTabIdsRef = useRef<Set<string>>(new Set());
  const tabActivationHistoryRef = useRef<string[]>([]);
  const rightTabActivationHistoryRef = useRef<string[]>([]);
  const leftBottomTabActivationHistoryRef = useRef<string[]>([]);
  const rightBottomTabActivationHistoryRef = useRef<string[]>([]);
  const previousHorizontalSplitStructureKeyRef = useRef<string | null>(null);
  const setCurrentNote = useNoteStore(state => state.setCurrentNote);
  const resetLinkState = useLinkStore(state => state.reset);

  const syncFileTabToNoteSystem = useCallback(async (
    tab: EditorTab,
    options?: {
      path?: string;
      title?: string;
      content?: string;
      previousPath?: string;
    }
  ) => {
    const candidateTab: EditorTab = {
      ...tab,
      path: options?.path ?? tab.path,
      title: options?.title ?? tab.title
    };

    if (!isLinkableFile(candidateTab)) {
      return null;
    }

    const path = (candidateTab.path ?? '').trim();
    if (!path) {
      return null;
    }

    return upsertNoteByPath({
      path,
      previousPath: options?.previousPath,
      title: candidateTab.title,
      content: options?.content ?? tab.content ?? ''
    });
  }, []);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) return;
    tabActivationHistoryRef.current = pushTabIdToHistory(tabActivationHistoryRef.current, activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    rightActiveTabIdRef.current = rightActiveTabId;
  }, [rightActiveTabId]);

  useEffect(() => {
    if (!rightActiveTabId) return;
    rightTabActivationHistoryRef.current = pushTabIdToHistory(rightTabActivationHistoryRef.current, rightActiveTabId);
  }, [rightActiveTabId]);

  useEffect(() => {
    leftBottomActiveTabIdRef.current = leftBottomActiveTabId;
  }, [leftBottomActiveTabId]);

  useEffect(() => {
    if (!leftBottomActiveTabId) return;
    leftBottomTabActivationHistoryRef.current = pushTabIdToHistory(
      leftBottomTabActivationHistoryRef.current,
      leftBottomActiveTabId
    );
  }, [leftBottomActiveTabId]);

  useEffect(() => {
    rightBottomActiveTabIdRef.current = rightBottomActiveTabId;
  }, [rightBottomActiveTabId]);

  useEffect(() => {
    if (!rightBottomActiveTabId) return;
    rightBottomTabActivationHistoryRef.current = pushTabIdToHistory(
      rightBottomTabActivationHistoryRef.current,
      rightBottomActiveTabId
    );
  }, [rightBottomActiveTabId]);

  useEffect(() => {
    focusedPaneIdRef.current = focusedPaneId;
  }, [focusedPaneId]);

  useEffect(() => {
    tabsRef.current = tabs;
    const currentTabIds = new Set(tabs.map(tab => tab.id));
    tabActivationHistoryRef.current = tabActivationHistoryRef.current.filter(id => currentTabIds.has(id));
  }, [tabs]);

  useEffect(() => {
    rightTabsRef.current = rightTabs;
    const currentTabIds = new Set(rightTabs.map(tab => tab.id));
    rightTabActivationHistoryRef.current = rightTabActivationHistoryRef.current.filter(id => currentTabIds.has(id));
  }, [rightTabs]);

  useEffect(() => {
    leftBottomTabsRef.current = leftBottomTabs;
    const currentTabIds = new Set(leftBottomTabs.map(tab => tab.id));
    leftBottomTabActivationHistoryRef.current = leftBottomTabActivationHistoryRef.current.filter(id => currentTabIds.has(id));
  }, [leftBottomTabs]);

  useEffect(() => {
    rightBottomTabsRef.current = rightBottomTabs;
    const currentTabIds = new Set(rightBottomTabs.map(tab => tab.id));
    rightBottomTabActivationHistoryRef.current = rightBottomTabActivationHistoryRef.current.filter(id => currentTabIds.has(id));
  }, [rightBottomTabs]);

  useEffect(() => {
    if (rightTabs.length === 0 && rightBottomTabs.length === 0 && extraRightSplitPanes.length === 0) {
      setIsSplitView(false);
      setRightVerticalSplit(false);
      setRightActiveTabId(null);
      setRightBottomActiveTabId(null);
      setLeftWidth(null);
      setRightColumnWidths({});
      setHasCustomizedHorizontalSplit(false);
    }
  }, [rightTabs.length, rightBottomTabs.length, extraRightSplitPanes.length]);

  useEffect(() => {
    if (leftBottomTabs.length === 0) {
      setLeftVerticalSplit(false);
      setLeftBottomActiveTabId(null);
      setLeftTopHeight(null);
    }
  }, [leftBottomTabs.length]);

  useEffect(() => {
    if (rightBottomTabs.length === 0) {
      setRightVerticalSplit(false);
      setRightBottomActiveTabId(null);
      setRightTopHeight(null);
    }
  }, [rightBottomTabs.length]);

  useEffect(() => {
    const openFilePaths = new Set(
      [...tabs, ...leftBottomTabs, ...rightTabs, ...rightBottomTabs]
        .filter(tab => tab.type === 'file' && !!tab.path)
        .map(tab => tab.path)
    );

    setExtraRightSplitPanes(prev => {
      const next = prev.filter(pane => openFilePaths.has(pane.sourcePath));
      return next.length === prev.length ? prev : next;
    });
  }, [tabs, leftBottomTabs, rightTabs, rightBottomTabs]);

  useEffect(() => {
    const validColumnIds = new Set(['right-main', ...extraRightSplitPanes.map(pane => pane.id)]);
    setRightColumnWidths(prev => {
      let changed = false;
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validColumnIds.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [extraRightSplitPanes]);

  useEffect(() => {
    // 仅在存在分屏状态时才尝试自动收敛，避免对普通单标签场景造成干扰
    if (!isSplitView && !leftVerticalSplit && !rightVerticalSplit && extraRightSplitPanes.length === 0) {
      return;
    }

    const paneSnapshots: Array<{ paneId: EditorPaneId; tabs: EditorTab[] }> = [
      { paneId: 'left-top', tabs },
      { paneId: 'left-bottom', tabs: leftBottomTabs },
      { paneId: 'right-top', tabs: rightTabs },
      { paneId: 'right-bottom', tabs: rightBottomTabs },
    ];
    const allTabs = paneSnapshots.flatMap(pane => pane.tabs);
    if (allTabs.length !== 1) {
      return;
    }

    const remainingPane = paneSnapshots.find(pane => pane.tabs.length > 0);
    const remainingTab = remainingPane?.tabs[0];
    if (!remainingPane || !remainingTab) {
      return;
    }

    if (remainingPane.paneId !== 'left-top') {
      setTabs([remainingTab]);
      setActiveTabId(remainingTab.id);
      tabActivationHistoryRef.current = [remainingTab.id];
    } else if (activeTabId !== remainingTab.id) {
      setActiveTabId(remainingTab.id);
    }

    if (leftBottomTabs.length > 0) {
      setLeftBottomTabs([]);
    }
    if (rightTabs.length > 0) {
      setRightTabs([]);
    }
    if (rightBottomTabs.length > 0) {
      setRightBottomTabs([]);
    }
    setLeftBottomActiveTabId(null);
    setRightActiveTabId(null);
    setRightBottomActiveTabId(null);
    leftBottomTabActivationHistoryRef.current = [];
    rightTabActivationHistoryRef.current = [];
    rightBottomTabActivationHistoryRef.current = [];

    if (extraRightSplitPanes.length > 0) {
      setExtraRightSplitPanes([]);
    }
    setIsSplitView(false);
    setLeftVerticalSplit(false);
    setRightVerticalSplit(false);
    setLeftWidth(null);
    setLeftTopHeight(null);
    setRightTopHeight(null);
    setRightColumnWidths({});
    setHasCustomizedHorizontalSplit(false);
    setFocusedPaneId('left-top');
  }, [
    tabs,
    activeTabId,
    leftBottomTabs,
    rightTabs,
    rightBottomTabs,
    isSplitView,
    leftVerticalSplit,
    rightVerticalSplit,
    extraRightSplitPanes,
  ]);

  const getPaneTabs = useCallback((paneId: EditorPaneId): EditorTab[] => {
    switch (paneId) {
      case 'left-top':
        return tabs;
      case 'left-bottom':
        return leftBottomTabs;
      case 'right-top':
        return rightTabs;
      case 'right-bottom':
        return rightBottomTabs;
      default:
        return [];
    }
  }, [tabs, leftBottomTabs, rightTabs, rightBottomTabs]);

  const getPaneActiveTabId = useCallback((paneId: EditorPaneId): string | null => {
    switch (paneId) {
      case 'left-top':
        return activeTabId;
      case 'left-bottom':
        return leftBottomActiveTabId;
      case 'right-top':
        return rightActiveTabId;
      case 'right-bottom':
        return rightBottomActiveTabId;
      default:
        return null;
    }
  }, [activeTabId, leftBottomActiveTabId, rightActiveTabId, rightBottomActiveTabId]);

  const setPaneActiveTabId = useCallback((paneId: EditorPaneId, tabId: string | null) => {
    if (paneId === 'left-top') {
      setActiveTabId(tabId);
      return;
    }
    if (paneId === 'left-bottom') {
      setLeftBottomActiveTabId(tabId);
      return;
    }
    if (paneId === 'right-top') {
      setRightActiveTabId(tabId);
      return;
    }
    setRightBottomActiveTabId(tabId);
  }, []);

  const setPaneTabs = useCallback((paneId: EditorPaneId, updater: (prev: EditorTab[]) => EditorTab[]) => {
    if (paneId === 'left-top') {
      setTabs(updater);
      return;
    }
    if (paneId === 'left-bottom') {
      setLeftBottomTabs(updater);
      return;
    }
    if (paneId === 'right-top') {
      setRightTabs(updater);
      return;
    }
    setRightBottomTabs(updater);
  }, []);

  const getAllPaneTabsSnapshot = useCallback((): EditorTab[] => {
    return [
      ...tabsRef.current,
      ...leftBottomTabsRef.current,
      ...rightTabsRef.current,
      ...rightBottomTabsRef.current,
    ];
  }, []);

  const findTabInAllPaneRefs = useCallback((tabId: string): EditorTab | null => {
    return getAllPaneTabsSnapshot().find(tab => tab.id === tabId) || null;
  }, [getAllPaneTabsSnapshot]);

  const updateFileTabContent = useCallback((
    tabId: string,
    content: string,
    options?: { clearDiffPreview?: boolean }
  ) => {
    const sourceTab = findTabInAllPaneRefs(tabId);
    if (!sourceTab || sourceTab.type !== 'file') {
      return;
    }

    const shouldSyncLinkedTabs = !composingTabIdsRef.current.has(tabId);
    const syncPath = sourceTab.path;

    const shouldUpdate = (tab: EditorTab): boolean => {
      if (tab.id === tabId) {
        return true;
      }
      return shouldSyncLinkedTabs && tab.type === 'file' && tab.path === syncPath;
    };

    const buildNextTab = (tab: EditorTab): EditorTab => {
      const nextTab: EditorTab = {
        ...tab,
        content,
        isDirty: true,
        isPreview: false,
      };

      if (options?.clearDiffPreview) {
        nextTab.diffPreview = undefined;
      }

      return nextTab;
    };

    setTabs(prev => prev.map(tab => shouldUpdate(tab) ? buildNextTab(tab) : tab));
    setLeftBottomTabs(prev => prev.map(tab => shouldUpdate(tab) ? buildNextTab(tab) : tab));
    setRightTabs(prev => prev.map(tab => shouldUpdate(tab) ? buildNextTab(tab) : tab));
    setRightBottomTabs(prev => prev.map(tab => shouldUpdate(tab) ? buildNextTab(tab) : tab));
  }, [findTabInAllPaneRefs]);

  const handleFileTabCompositionStateChange = useCallback((
    tabId: string,
    isComposing: boolean,
    content: string | undefined,
    options?: { clearDiffPreview?: boolean }
  ) => {
    if (isComposing) {
      composingTabIdsRef.current.add(tabId);
      return;
    }

    composingTabIdsRef.current.delete(tabId);

    if (typeof content !== 'string') {
      return;
    }

    updateFileTabContent(tabId, content, options);
  }, [updateFileTabContent]);

  const getPaneHistoryRef = useCallback((paneId: EditorPaneId) => {
    if (paneId === 'left-top') {
      return tabActivationHistoryRef;
    }
    if (paneId === 'left-bottom') {
      return leftBottomTabActivationHistoryRef;
    }
    if (paneId === 'right-top') {
      return rightTabActivationHistoryRef;
    }
    return rightBottomTabActivationHistoryRef;
  }, []);

  const updateTabInAllPanes = useCallback((tabId: string, updater: (tab: EditorTab) => EditorTab) => {
    const allTabs = [
      ...tabsRef.current,
      ...leftBottomTabsRef.current,
      ...rightTabsRef.current,
      ...rightBottomTabsRef.current,
    ];
    const sourceTab = allTabs.find(tab => tab.id === tabId) || null;
    const syncPath = sourceTab?.type === 'file' ? sourceTab.path : null;

    const shouldUpdate = (tab: EditorTab): boolean => {
      if (tab.id === tabId) {
        return true;
      }
      return !!syncPath && tab.type === 'file' && tab.path === syncPath;
    };

    setTabs(prev => prev.map(tab => shouldUpdate(tab) ? updater(tab) : tab));
    setLeftBottomTabs(prev => prev.map(tab => shouldUpdate(tab) ? updater(tab) : tab));
    setRightTabs(prev => prev.map(tab => shouldUpdate(tab) ? updater(tab) : tab));
    setRightBottomTabs(prev => prev.map(tab => shouldUpdate(tab) ? updater(tab) : tab));
  }, []);

  const findPaneByTabId = useCallback((tabId: string): { paneId: EditorPaneId; tab: EditorTab } | null => {
    const paneOrder: Array<{ paneId: EditorPaneId; tabs: EditorTab[] }> = [
      { paneId: 'left-top', tabs },
      { paneId: 'left-bottom', tabs: leftBottomTabs },
      { paneId: 'right-top', tabs: rightTabs },
      { paneId: 'right-bottom', tabs: rightBottomTabs },
    ];

    for (const pane of paneOrder) {
      const found = pane.tabs.find(tab => tab.id === tabId);
      if (found) {
        return { paneId: pane.paneId, tab: found };
      }
    }

    return null;
  }, [tabs, leftBottomTabs, rightTabs, rightBottomTabs]);

  const findPaneByPath = useCallback((path: string, type: EditorTab['type']): { paneId: EditorPaneId; tab: EditorTab } | null => {
    const paneOrder: Array<{ paneId: EditorPaneId; tabs: EditorTab[] }> = [
      { paneId: 'left-top', tabs },
      { paneId: 'left-bottom', tabs: leftBottomTabs },
      { paneId: 'right-top', tabs: rightTabs },
      { paneId: 'right-bottom', tabs: rightBottomTabs },
    ];

    for (const pane of paneOrder) {
      const found = pane.tabs.find(tab => tab.path === path && (tab.type || 'file') === type);
      if (found) {
        return { paneId: pane.paneId, tab: found };
      }
    }

    return null;
  }, [tabs, leftBottomTabs, rightTabs, rightBottomTabs]);

  const disposeTabResources = useCallback((tab: EditorTab | null | undefined) => {
    if (!tab) {
      return;
    }

    if (tab.type === 'terminal') {
      tab.terminalData?.session.dispose({ destroyTerminal: true });
    }
  }, []);

  const removeTabFromPane = useCallback((paneId: EditorPaneId, tabId: string) => {
    setPaneTabs(paneId, prev => prev.filter(tab => tab.id !== tabId));

    const historyRef = paneId === 'left-top'
      ? tabActivationHistoryRef
      : paneId === 'left-bottom'
        ? leftBottomTabActivationHistoryRef
        : paneId === 'right-top'
          ? rightTabActivationHistoryRef
          : rightBottomTabActivationHistoryRef;
    historyRef.current = removeTabIdFromHistory(historyRef.current, tabId);
  }, [setPaneTabs]);

  const pickNextActiveForPane = useCallback((paneId: EditorPaneId, nextTabs: EditorTab[]) => {
    const history = paneId === 'left-top'
      ? tabActivationHistoryRef.current
      : paneId === 'left-bottom'
        ? leftBottomTabActivationHistoryRef.current
        : paneId === 'right-top'
          ? rightTabActivationHistoryRef.current
          : rightBottomTabActivationHistoryRef.current;

    const nextActive = getMostRecentTabId(history, nextTabs);
    setPaneActiveTabId(paneId, nextActive);
  }, [setPaneActiveTabId]);

  const ensurePaneVisibleForDrop = useCallback((paneId: EditorPaneId) => {
    if (paneId.startsWith('right-')) {
      setIsSplitView(true);
    }
    if (paneId === 'left-bottom') {
      setLeftVerticalSplit(true);
    }
    if (paneId === 'right-bottom') {
      setIsSplitView(true);
      setRightVerticalSplit(true);
    }
  }, []);

  const moveTabToPane = useCallback((tabId: string, targetPaneId: EditorPaneId) => {
    const located = findPaneByTabId(tabId);
    if (!located) {
      return;
    }

    const { paneId: sourcePaneId, tab } = located;
    if (sourcePaneId === targetPaneId) {
      setPaneActiveTabId(targetPaneId, tabId);
      setFocusedPaneId(targetPaneId);
      return;
    }

    if (tab.type !== 'file' && targetPaneId !== 'left-top') {
      toastService.info('仅文件标签支持分屏移动');
      return;
    }

    if (tab.type === 'file') {
      const paneOrder: Array<{ paneId: EditorPaneId; tabs: EditorTab[] }> = [
        { paneId: 'left-top', tabs },
        { paneId: 'left-bottom', tabs: leftBottomTabs },
        { paneId: 'right-top', tabs: rightTabs },
        { paneId: 'right-bottom', tabs: rightBottomTabs },
      ];
      const existingSamePath = paneOrder
        .flatMap(pane => pane.tabs.map(item => ({ paneId: pane.paneId, tab: item })))
        .find(item =>
          item.tab.id !== tab.id &&
          item.tab.type === 'file' &&
          item.tab.path === tab.path
        );
      if (existingSamePath) {
        removeTabFromPane(sourcePaneId, tabId);
        setPaneActiveTabId(existingSamePath.paneId, existingSamePath.tab.id);
        setFocusedPaneId(existingSamePath.paneId);
        return;
      }
    }

    ensurePaneVisibleForDrop(targetPaneId);
    removeTabFromPane(sourcePaneId, tabId);

    setPaneTabs(targetPaneId, prev => [...prev, tab]);
    setPaneActiveTabId(targetPaneId, tabId);
    setFocusedPaneId(targetPaneId);

    const sourceNextTabs = getPaneTabs(sourcePaneId).filter(item => item.id !== tabId);
    pickNextActiveForPane(sourcePaneId, sourceNextTabs);
  }, [
    findPaneByTabId,
    tabs,
    leftBottomTabs,
    rightTabs,
    rightBottomTabs,
    setPaneActiveTabId,
    ensurePaneVisibleForDrop,
    removeTabFromPane,
    setPaneTabs,
    getPaneTabs,
    pickNextActiveForPane
  ]);

  // 澶勭悊鎵撳紑缂栬緫鍣ㄦ爣绛鹃〉
  const handleOpenEditorTab = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<{
      path?: string;
      content?: string;
      language?: string;
      title?: string;
      type?: EditorTab['type'];
    }>;
    const { path, content, language, title, type } = customEvent.detail || {};
    if (!path) return;

    const resolvedType: EditorTab['type'] = type === 'ai-chat' ? 'ai-chat' : 'file';
    console.log('[EditorArea] 打开编辑器标签页:', title, resolvedType);

    // 检查是否已经打开相同路径的标签页（四个分区都检查）
    const existingTabResult = findPaneByPath(path, resolvedType);
    if (existingTabResult) {
      const { paneId, tab } = existingTabResult;
      if (resolvedType === 'ai-chat' && title && tab.title !== title) {
        setPaneTabs(paneId, prev => prev.map(item =>
          item.id === tab.id ? { ...item, title } : item
        ));
      }
      setPaneActiveTabId(paneId, tab.id);
      setFocusedPaneId(paneId);
      return;
    }

    // 创建新的标签页
    const newTab: EditorTab = {
      id: `${resolvedType || 'editor'}-${Date.now()}`,
      title: title || (resolvedType === 'ai-chat' ? '未选择模型' : '新文件'),
      path,
      isDirty: false,
      language: resolvedType === 'file' ? (language || 'plaintext') : undefined,
      content: resolvedType === 'file' ? (content || '') : undefined,
      type: resolvedType
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setFocusedPaneId('left-top');
  }, [findPaneByPath, setPaneTabs, setPaneActiveTabId]);

  const handleOpenTerminalTab = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<OpenTerminalTabDetail>;
    const { id, path, title, terminalSession, accentColor } = customEvent.detail || {};
    if (!terminalSession) {
      return;
    }

    const resolvedPath = path || `terminal:/${id || Date.now()}`;
    const existingTabResult = findPaneByPath(resolvedPath, 'terminal');
    if (existingTabResult) {
      const { paneId, tab } = existingTabResult;
      setPaneTabs(paneId, prev => prev.map(item => (
        item.id === tab.id
          ? {
            ...item,
            title: title || item.title,
            terminalData: {
              session: terminalSession,
              accentColor: accentColor ?? item.terminalData?.accentColor ?? null,
            },
          }
          : item
      )));
      setPaneActiveTabId(paneId, tab.id);
      setFocusedPaneId(paneId);
      return;
    }

    const newTab: EditorTab = {
      id: id || `terminal-tab-${Date.now()}`,
      title: title || '终端',
      path: resolvedPath,
      isDirty: false,
      type: 'terminal',
      terminalData: {
        session: terminalSession,
        accentColor: accentColor ?? null,
      },
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setFocusedPaneId('left-top');
  }, [findPaneByPath, setPaneTabs, setPaneActiveTabId]);

  useEffect(() => {
    window.addEventListener('open-editor-tab', handleOpenEditorTab);
    window.addEventListener('open-terminal-tab', handleOpenTerminalTab as EventListener);
    
    return () => {
      window.removeEventListener('open-editor-tab', handleOpenEditorTab);
      window.removeEventListener('open-terminal-tab', handleOpenTerminalTab as EventListener);
    };
  }, [handleOpenEditorTab, handleOpenTerminalTab]);

  useEffect(() => () => {
    getAllPaneTabsSnapshot().forEach((tab) => {
      disposeTabResources(tab);
    });
  }, [disposeTabResources, getAllPaneTabsSnapshot]);

  // 鐩戝惉鎻掑叆鏁版嵁搴撹〃鏍间簨浠讹紝璺宠浆鍒版枃浠剁紪杈戝櫒鏍囩椤?
  useEffect(() => {
    const handleInsertDatabaseTable = (event: Event) => {
      const customEvent = event as CustomEvent<{ focusEditor?: boolean }>;
      if (customEvent.detail?.focusEditor) {
        // 鎵惧埌绗竴涓枃浠剁被鍨嬬殑鏍囩椤碉紙闈炶璁″櫒锛?
        const fileTab = tabs.find(t => t.type === 'file');
        if (fileTab) {
          setActiveTabId(fileTab.id);
        }
      }
    };

    window.addEventListener('insert-database-table', handleInsertDatabaseTable as EventListener);
    return () => {
      window.removeEventListener('insert-database-table', handleInsertDatabaseTable as EventListener);
    };
  }, [tabs]);

  // 鍔犺浇涓婃鎵撳紑鐨勬枃妗?
  useEffect(() => {
    const loadLastOpened = async () => {
      try {
        const result = await window.electron?.workspace?.getLastOpened();
        const lastOpenedPath = resolveLastOpenedPath(result as LastOpenedRestoreResult | undefined);
        if (!lastOpenedPath) return;

        const fileResult = await window.electron?.file?.read(lastOpenedPath);
        const restoredFile = fileResult?.success ? fileResult.data : undefined;
        const restoredPath = restoredFile?.path?.trim() || '';
        if (!restoredPath) return;

        const restoredTitle = restoredFile?.name?.trim() || getFileNameFromPath(restoredPath);
        const newTab: EditorTab = {
          id: `file-${Date.now()}`,
          title: restoredTitle,
          path: restoredPath,
          isDirty: false,
          language: restoredFile?.language || 'plaintext',
          content: restoredFile?.content || '',
          type: 'file'
        };
        setTabs([newTab]);
        setActiveTabId(newTab.id);
      } catch (error) {
        // 鍔犺浇涓婃鎵撳紑鐨勬枃浠跺け璐ワ紝闈欓粯澶勭悊
      }
    };

    loadLastOpened();
  }, []);

  // 鐩戝惉鎵撳紑鏂囦欢浜嬩欢
  useEffect(() => {
    console.log('[EditorArea] ========== useEffect 寮€濮嬫敞鍐屼簨浠剁洃鍚櫒 ==========');
    console.log('[EditorArea] 褰撳墠 tabs 鏁伴噺:', tabs.length);
    
    const handleOpenFile = async (event: Event) => {
      tabChangeReasonOverrideRef.current = 'open';
      console.log('[EditorArea] ========== 鏀跺埌 open-file 浜嬩欢 ==========');
      console.log('[EditorArea] 浜嬩欢绫诲瀷:', event.type);
      console.log('[EditorArea] 浜嬩欢瀵硅薄:', event);
      
      const customEvent = event as CustomEvent<{ 
        path?: string; 
        content?: string; 
        name?: string; 
        language?: string;
        isPreview?: boolean;  // 鏂板锛氭槸鍚︿负棰勮妯″紡
        lineNumber?: number;  // 鏂板锛氳瀹氫綅鐨勮鍙?
        column?: number;      // 鏂板锛氳瀹氫綅鐨勫垪鍙?
      }>;
      
      console.log('[EditorArea] 浜嬩欢璇︽儏:', customEvent.detail);
      console.log('[EditorArea] 璇︽儏绫诲瀷:', typeof customEvent.detail);
      
      if (customEvent.detail) {
        // 浣跨敤鑷畾涔変簨浠朵腑鐨勬枃浠舵暟鎹?
        const { path, content, name, language, isPreview = false, lineNumber, column } = customEvent.detail;
        
        console.log('[EditorArea] Opening file:', {
          path,
          name,
          language,
          contentLength: content?.length || 0,
          contentPreview: content?.substring(0, 100),
          isPreview
        });

        const paneSnapshots: Array<{
          paneId: EditorPaneId;
          tabs: EditorTab[];
          setTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
          setActive: React.Dispatch<React.SetStateAction<string | null>>;
        }> = [
          { paneId: 'left-top', tabs: tabsRef.current, setTabs, setActive: setActiveTabId },
          { paneId: 'left-bottom', tabs: leftBottomTabsRef.current, setTabs: setLeftBottomTabs, setActive: setLeftBottomActiveTabId },
          { paneId: 'right-top', tabs: rightTabsRef.current, setTabs: setRightTabs, setActive: setRightActiveTabId },
          { paneId: 'right-bottom', tabs: rightBottomTabsRef.current, setTabs: setRightBottomTabs, setActive: setRightBottomActiveTabId },
        ];

        const existingPane = paneSnapshots.find(pane => pane.tabs.some(tab => tab.path === path));
        if (existingPane) {
          const existingTab = existingPane.tabs.find(tab => tab.path === path)!;
          existingPane.setActive(existingTab.id);
          setFocusedPaneId(existingPane.paneId);
          if (existingPane.paneId.startsWith('right-')) {
            setIsSplitView(true);
          }
          if (existingPane.paneId === 'left-bottom') {
            setLeftVerticalSplit(true);
          }
          if (existingPane.paneId === 'right-bottom') {
            setRightVerticalSplit(true);
          }
          if (!isPreview && existingTab.isPreview) {
            existingPane.setTabs(prev => prev.map(tab =>
              tab.id === existingTab.id
                ? {
                    ...tab,
                    isPreview: false,
                    content: content !== undefined ? content : tab.content,
                    language: language || tab.language
                  }
                : tab
            ));
          } else if (content !== undefined) {
            existingPane.setTabs(prev => prev.map(tab =>
              tab.id === existingTab.id
                ? { ...tab, content, language: language || tab.language }
                : tab
            ));
          }
          return;
        }
        
        // 浣跨敤鍑芥暟寮忔洿鏂版潵璁块棶鏈€鏂扮殑 tabs 鐘舵€侊紝閬垮厤闂寘闂
        setTabs(currentTabs => {
          // 妫€鏌ユ槸鍚﹀凡缁忔墦寮€浜嗚鏂囦欢
          const existingTab = currentTabs.find(tab => tab.path === path);
          
          if (existingTab) {
            // 璁剧疆涓烘椿鍔ㄦ爣绛?
            setTimeout(() => setActiveTabId(existingTab.id), 0);
            
            // 濡傛灉鏄弻鍑绘墦寮€锛堥潪棰勮锛夛紝灏嗛瑙堟爣绛捐浆涓哄浐瀹氭爣绛?
            // 鍚屾椂鏇存柊鏍囩鐨勫唴瀹癸紙濡傛灉鎻愪緵浜嗭級
            if (!isPreview && existingTab.isPreview) {
              return currentTabs.map(tab => 
                tab.id === existingTab.id 
                  ? { 
                      ...tab, 
                      isPreview: false,
                      content: content !== undefined ? content : tab.content,
                      language: language || tab.language
                    } 
                  : tab
              );
            } else if (content !== undefined) {
              // 鏇存柊鍐呭锛堝鏋滄彁渚涗簡鏂板唴瀹癸級
              return currentTabs.map(tab => 
                tab.id === existingTab.id 
                  ? { 
                      ...tab, 
                      content: content,
                      language: language || tab.language
                    } 
                  : tab
              );
            }
            // 娌℃湁鍙樺寲锛岃繑鍥炲師鏁扮粍
            return currentTabs;
          }
          
          // 濡傛灉鏄瑙堟ā寮忥紝鏇挎崲鐜版湁鐨勯瑙堟爣绛?
          if (isPreview) {
            const previewTab = currentTabs.find(tab => tab.isPreview);
            if (previewTab) {
              // 鏇挎崲棰勮鏍囩
              const newId = `file-${Date.now()}`;
              setTimeout(() => setActiveTabId(newId), 0);
              return currentTabs.map(tab => 
                tab.isPreview ? {
                  id: newId,
                  title: name || 'Untitled',
                  path: path || '',
                  isDirty: false,
                  language: language || 'plaintext',
                  content: content || '',
                  type: 'file' as const,
                  isPreview: true
                } : tab
              );
            }
          }
          
          // 鍒涘缓鏂版爣绛?
          const newTab: EditorTab = {
            id: `file-${Date.now()}`,
            title: name || 'Untitled',
            path: path || '',
            isDirty: false,
            language: language || 'plaintext',
            content: content || '',
            type: 'file',
            isPreview: isPreview
          };
          
          console.log('[EditorArea] Created new tab:', {
            id: newTab.id,
            title: newTab.title,
            contentLength: newTab.content?.length || 0,
            language: newTab.language
          });
          
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        });
        
        // 闇€瑕佸湪鐘舵€佹洿鏂板悗鑾峰彇 existingTab.id 鎴?newTab.id 鏉ヨ缃椿鍔ㄦ爣绛?
        // 鐢变簬鎴戜滑鍦ㄥ嚱鏁板紡鏇存柊涓棤娉曠洿鎺ヨ闂紝鎴戜滑浣跨敤 setTimeout 鍦ㄤ笂闈㈢殑浠ｇ爜涓缃?
        
        // 濡傛灉鎸囧畾浜嗚鍙凤紝瑙﹀彂瀹氫綅浜嬩欢
        if (lineNumber) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('editor-reveal-line', {
              detail: { lineNumber, column: column || 1 }
            }));
          }, 100);
        }
      } else {
        // 鎵撳紑鏂囦欢瀵硅瘽妗嗭紙闈為瑙堟ā寮忥級
        try {
          const result = await window.electron?.file?.open();
          if (result?.success && result.data) {
            const { path, content, name, language } = result.data;

            const paneSnapshots: Array<{
              paneId: EditorPaneId;
              tabs: EditorTab[];
              setActive: React.Dispatch<React.SetStateAction<string | null>>;
            }> = [
              { paneId: 'left-top', tabs: tabsRef.current, setActive: setActiveTabId },
              { paneId: 'left-bottom', tabs: leftBottomTabsRef.current, setActive: setLeftBottomActiveTabId },
              { paneId: 'right-top', tabs: rightTabsRef.current, setActive: setRightActiveTabId },
              { paneId: 'right-bottom', tabs: rightBottomTabsRef.current, setActive: setRightBottomActiveTabId },
            ];
            const existingPane = paneSnapshots.find(pane => pane.tabs.some(tab => tab.path === path));
            if (existingPane) {
              const existingTab = existingPane.tabs.find(tab => tab.path === path)!;
              existingPane.setActive(existingTab.id);
              setFocusedPaneId(existingPane.paneId);
              if (existingPane.paneId.startsWith('right-')) {
                setIsSplitView(true);
              }
              if (existingPane.paneId === 'left-bottom') {
                setLeftVerticalSplit(true);
              }
              if (existingPane.paneId === 'right-bottom') {
                setRightVerticalSplit(true);
              }
              return;
            }
            
            // 浣跨敤鍑芥暟寮忔洿鏂?
            setTabs(currentTabs => {
              // 妫€鏌ユ槸鍚﹀凡缁忔墦寮€浜嗚鏂囦欢
              const existingTab = currentTabs.find(tab => tab.path === path);
              
              if (existingTab) {
                // 鍥哄畾棰勮鏍囩
                if (existingTab.isPreview) {
                  setTimeout(() => setActiveTabId(existingTab.id), 0);
                  return currentTabs.map(tab => 
                    tab.id === existingTab.id ? { ...tab, isPreview: false } : tab
                  );
                }
                setTimeout(() => setActiveTabId(existingTab.id), 0);
                return currentTabs;
              }
              
              const newTab: EditorTab = {
                id: `file-${Date.now()}`,
                title: name,
                path: path,
                isDirty: false,
                language: language || 'plaintext',
                content: content,
                type: 'file',
                isPreview: false
              };
              setTimeout(() => setActiveTabId(newTab.id), 0);
              return [...currentTabs, newTab];
            });
          }
        } catch (error) {
          // 鎵撳紑鏂囦欢澶辫触锛岄潤榛樺鐞?
        }
      }
    };

    const handleReplaceActiveTabContent = (event: Event) => {
      const customEvent = event as CustomEvent<ReplaceActiveTabContentDetail>;
      const detail = customEvent.detail;
      if (!detail || typeof detail.content !== 'string') return;

      const targetPath = typeof detail.path === 'string' ? detail.path : '';
      const targetName = typeof detail.name === 'string' ? detail.name : '';
      const markDirty = detail.markDirty ?? false;
      const normalizedTargetPath = targetPath ? normalizeComparableFilePath(targetPath) : '';

      const applyToTabs = (
        currentTabs: EditorTab[],
        activeId: string | null
      ): { tabs: EditorTab[]; resolvedId: string | null; matched: boolean } => {
        let resolvedTargetId: string | null = null;
        let matched = false;

        const updatedTabs = currentTabs.map(tab => {
          if (tab.type !== 'file') return tab;

          const normalizedTabPath = normalizeComparableFilePath(tab.path || '');
          const matchByPath = !!normalizedTargetPath && normalizedTabPath === normalizedTargetPath;
          const matchByActive = !normalizedTargetPath && !!activeId && tab.id === activeId;
          if (!matchByPath && !matchByActive) return tab;

          matched = true;
          resolvedTargetId = tab.id;
          return {
            ...tab,
            title: targetName || tab.title,
            path: tab.path || targetPath || tab.path,
            content: detail.content,
            isDirty: markDirty,
            diffPreview: detail.diffPreview,
          };
        });

        return { tabs: updatedTabs, resolvedId: resolvedTargetId, matched };
      };

      const leftSnapshot = tabsRef.current;
      const rightSnapshot = rightTabsRef.current;
      const leftBottomSnapshot = leftBottomTabsRef.current;
      const rightBottomSnapshot = rightBottomTabsRef.current;
      const leftResult = applyToTabs(leftSnapshot, activeTabIdRef.current);
      const rightResult = applyToTabs(rightSnapshot, rightActiveTabIdRef.current);
      const leftBottomResult = applyToTabs(leftBottomSnapshot, leftBottomActiveTabIdRef.current);
      const rightBottomResult = applyToTabs(rightBottomSnapshot, rightBottomActiveTabIdRef.current);

      if (leftResult.matched) {
        setTabs(leftResult.tabs);
        if (leftResult.resolvedId) {
          setTimeout(() => setActiveTabId(leftResult.resolvedId), 0);
        }
      }

      if (rightResult.matched) {
        setRightTabs(rightResult.tabs);
        if (rightResult.resolvedId) {
          setTimeout(() => setRightActiveTabId(rightResult.resolvedId), 0);
        }
      }

      if (leftBottomResult.matched) {
        setLeftBottomTabs(leftBottomResult.tabs);
        if (leftBottomResult.resolvedId) {
          setTimeout(() => setLeftBottomActiveTabId(leftBottomResult.resolvedId), 0);
        }
      }

      if (rightBottomResult.matched) {
        setRightBottomTabs(rightBottomResult.tabs);
        if (rightBottomResult.resolvedId) {
          setTimeout(() => setRightBottomActiveTabId(rightBottomResult.resolvedId), 0);
        }
      }

      if (leftResult.matched || rightResult.matched || leftBottomResult.matched || rightBottomResult.matched) {
        return;
      }

      if (targetPath) {
        const createdTab: EditorTab = {
          id: `file-${Date.now()}`,
          title: targetName || 'Untitled',
          path: targetPath,
          isDirty: markDirty,
          language: targetPath.toLowerCase().endsWith('.md') ? 'markdown' : 'plaintext',
          content: detail.content,
          type: 'file',
          isPreview: false,
          diffPreview: detail.diffPreview,
        };
        setTabs(prev => [...prev, createdTab]);
        setTimeout(() => setActiveTabId(createdTab.id), 0);
      }
    };

    const handleOpenSettings = () => {
      // 浣跨敤鍑芥暟寮忔洿鏂版潵璁块棶鏈€鏂扮殑 tabs 鐘舵€?
      setTabs(currentTabs => {
        // 妫€鏌ユ槸鍚﹀凡缁忔湁璁剧疆鏍囩椤?
        const settingsTab = currentTabs.find(tab => tab.type === 'settings');
        
        if (settingsTab) {
          // 濡傛灉宸插瓨鍦紝鐩存帴婵€娲?
          setTimeout(() => setActiveTabId(settingsTab.id), 0);
          return currentTabs;
        } else {
          // 鍚﹀垯鍒涘缓鏂扮殑璁剧疆鏍囩椤?
          const newTab: EditorTab = {
            id: `settings-${Date.now()}`,
            title: '璁剧疆',
            path: 'settings:/',
            isDirty: false,
            type: 'settings'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenMediaPanel = () => {
      setTabs(currentTabs => {
        const mediaTab = currentTabs.find(tab => tab.type === 'media');

        if (mediaTab) {
          setTimeout(() => setActiveTabId(mediaTab.id), 0);
          return currentTabs;
        } else {
          const newTab: EditorTab = {
            id: `media-${Date.now()}`,
            title: '绱犳潗绠＄悊',
            path: 'media:/',
            isDirty: false,
            type: 'media'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenExtensionManager = () => {
      // 浣跨敤鍑芥暟寮忔洿鏂版潵璁块棶鏈€鏂扮殑 tabs 鐘舵€?
      setTabs(currentTabs => {
        // 妫€鏌ユ槸鍚﹀凡缁忔湁鎵╁睍绠＄悊鏍囩椤?
        const extensionManagerTab = currentTabs.find(tab => tab.type === 'extension-manager');
        
        if (extensionManagerTab) {
          // 濡傛灉宸插瓨鍦紝鐩存帴婵€娲?
          setTimeout(() => setActiveTabId(extensionManagerTab.id), 0);
          console.log('[EditorArea] 婵€娲荤幇鏈夋墿灞曠鐞嗘爣绛鹃〉');
          return currentTabs;
        } else {
          // 鍚﹀垯鍒涘缓鏂扮殑鎵╁睍绠＄悊鏍囩椤?
          const newTab: EditorTab = {
            id: `extension-manager-${Date.now()}`,
            title: '鎵╁睍绠＄悊',
            path: 'extension-manager:/',
            isDirty: false,
            type: 'extension-manager'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          console.log('[EditorArea] 创建新的扩展管理标签页');
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenSettingsJson = (event: Event) => {
      const customEvent = event as CustomEvent<{ content: string }>;
      const jsonContent = customEvent.detail?.content || '{}';
      
      // 妫€鏌ユ槸鍚﹀凡缁忔湁 settings.json 鏍囩椤?
      const settingsJsonTab = tabs.find(tab => tab.path === 'settings:/settings.json');
      
      if (settingsJsonTab) {
        // 濡傛灉宸插瓨鍦紝鏇存柊鍐呭骞舵縺娲?
        setTabs(prev => prev.map(tab => 
          tab.path === 'settings:/settings.json' 
            ? { ...tab, content: jsonContent }
            : tab
        ));
        setActiveTabId(settingsJsonTab.id);
      } else {
        // 鍚﹀垯鍒涘缓鏂扮殑 settings.json 鏍囩椤?
        const newTab: EditorTab = {
          id: `settings-json-${Date.now()}`,
          title: 'settings.json',
          path: 'settings:/settings.json',
          isDirty: false,
          language: 'jsonc',  // 浣跨敤 jsonc 鏀寔娉ㄩ噴
          content: jsonContent,
          type: 'file'
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
      }
    };

    const handleShowMarkdownPreview = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        content: string;
        sourceTabId: string;
        title: string;
      }>;
      const { content, sourceTabId, title } = customEvent.detail;
      
      // 鍦ㄥ彸渚х紪杈戝櫒缁勫垱寤洪瑙堟爣绛鹃〉
      const previewTab: EditorTab = {
        id: `preview-${sourceTabId}`,
        title: `棰勮 - ${title}`,
        path: `preview:/${sourceTabId}`,
        isDirty: false,
        language: 'markdown',
        content: content,
        type: 'markdown-preview',
        sourceTabId: sourceTabId
      };
      
      // 妫€鏌ュ彸渚ф槸鍚﹀凡鏈夎棰勮鏍囩
      const existingPreview = rightTabs.find(tab => tab.sourceTabId === sourceTabId);
      
      if (existingPreview) {
        // 鏇存柊鍐呭
        setRightTabs(prev => prev.map(tab => 
          tab.id === existingPreview.id ? { ...tab, content } : tab
        ));
        setRightActiveTabId(existingPreview.id);
      } else {
        // 鍒涘缓鏂伴瑙堟爣绛?
        setRightTabs(prev => [...prev, previewTab]);
        setRightActiveTabId(previewTab.id);
      }
      
      // 婵€娲诲垎鍓茶鍥?
      setIsSplitView(true);
    };

    const handleOpenLanceDBView = () => {
      setTabs(currentTabs => {
        const existingTab = currentTabs.find(tab => tab.type === 'lancedb-view');
        
        if (existingTab) {
          setTimeout(() => setActiveTabId(existingTab.id), 0);
          return currentTabs;
        } else {
          const newTab: EditorTab = {
            id: `lancedb-view-${Date.now()}`,
            title: '鏌ョ湅鍒嗗潡鏁版嵁',
            path: 'lancedb-view:/',
            isDirty: false,
            type: 'lancedb-view'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    // 鎵撳紑琛ㄦ牸璁捐鍣?
    const handleOpenTableDesigner = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId?: string; formName?: string; newTab?: boolean }>;
      const { formId, formName, newTab } = customEvent.detail || {};
      
      setTabs(currentTabs => {
        // 濡傛灉鏈?formId锛屾鏌ユ槸鍚﹀凡缁忔墦寮€
        if (formId && !newTab) {
          const existingTab = currentTabs.find(tab => tab.formId === formId);
          if (existingTab) {
            setTimeout(() => setActiveTabId(existingTab.id), 0);
            return currentTabs;
          }
        }
        
        const tabId = `table-designer-${formId || Date.now()}`;
        const tabTitle = formName ? `表格 - ${formName}` : '表格设计器';
        const newTabItem: EditorTab = {
          id: tabId,
          title: tabTitle,
          path: `table-designer:/${formId || Date.now()}`,
          isDirty: false,
          type: 'table-designer',
          formId: formId,
        };
        setTimeout(() => setActiveTabId(newTabItem.id), 0);
        return [...currentTabs, newTabItem];
      });
    };

    // 鎵撳紑 Mermaid 娴佺▼鍥捐璁″櫒
    const handleOpenMermaidDesigner = (event: Event) => {
      const customEvent = event as CustomEvent<{ code: string; title: string }>;
      const { code, title } = customEvent.detail;

      setTabs(currentTabs => {
        const newTab: EditorTab = {
          id: `mermaid-designer-${Date.now()}`,
          title: title || '娴佺▼鍥捐璁″櫒',
          path: `mermaid-designer:/${Date.now()}`,
          isDirty: false,
          type: 'mermaid-designer',
          mermaidData: { code, title }
        };
        setTimeout(() => setActiveTabId(newTab.id), 0);
        return [...currentTabs, newTab];
      });
    };

    // 鎵撳紑 Skills 甯傚満
    const handleOpenSkillsMarket = () => {
      setTabs(currentTabs => {
        const existingTab = currentTabs.find(tab => tab.type === 'skills-market');

        if (existingTab) {
          setTimeout(() => setActiveTabId(existingTab.id), 0);
          return currentTabs;
        } else {
          const newTab: EditorTab = {
            id: `skills-market-${Date.now()}`,
            title: 'Skills 甯傚満',
            path: 'skills-market:/',
            isDirty: false,
            type: 'skills-market'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenDecompositionRules = (event: Event) => {
      const customEvent = event as CustomEvent<{
        rules?: Array<{
          id: string;
          name: string;
          instruction: string;
          enabled: boolean;
          builtin: boolean;
        }>;
        writingRuleDocuments?: Array<{
          id: string;
          name: string;
          path: string;
          enabled: boolean;
        }>;
      }>;
      const initialRules = Array.isArray(customEvent.detail?.rules)
        ? customEvent.detail.rules
        : [];
      const initialWritingRuleDocuments = Array.isArray(customEvent.detail?.writingRuleDocuments)
        ? customEvent.detail.writingRuleDocuments
        : [];

      setTabs(currentTabs => {
        const existingTab = currentTabs.find(tab => tab.type === 'decomposition-rules');

        if (existingTab) {
          setTimeout(() => setActiveTabId(existingTab.id), 0);
          return currentTabs;
        }

        const newTab: EditorTab = {
          id: `decomposition-rules-${Date.now()}`,
          title: '鎷嗚В瑙勫垯绠＄悊',
          path: 'decomposition-rules:/',
          isDirty: false,
          type: 'decomposition-rules',
          decompositionRulesData: initialRules.length > 0 || initialWritingRuleDocuments.length > 0
            ? {
                rules: initialRules.map(rule => ({ ...rule })),
                writingRuleDocuments: initialWritingRuleDocuments.map(document => ({ ...document })),
              }
            : undefined,
        };
        setTimeout(() => setActiveTabId(newTab.id), 0);
        return [...currentTabs, newTab];
      });
    };

    const handleOpenPromptManagement = () => {
      setTabs(currentTabs => {
        const existingTab = currentTabs.find(tab => tab.type === 'prompt-management');

        if (existingTab) {
          setTimeout(() => setActiveTabId(existingTab.id), 0);
          return currentTabs;
        }

        const newTab: EditorTab = {
          id: `prompt-management-${Date.now()}`,
          title: '提示词管理',
          path: 'prompt-management:/',
          isDirty: false,
          type: 'prompt-management',
        };
        setTimeout(() => setActiveTabId(newTab.id), 0);
        return [...currentTabs, newTab];
      });
    };

    const handleUpdateActiveTabTitle = (event: Event) => {
      const customEvent = event as CustomEvent<UpdateActiveTabTitleDetail>;
      const title = customEvent.detail?.title?.trim();
      if (!title) return;

      const leftActiveId = activeTabIdRef.current;
      const leftActiveTab = leftActiveId
        ? tabsRef.current.find(tab => tab.id === leftActiveId)
        : undefined;
      if (leftActiveTab?.type === 'ai-chat') {
        setTabs(currentTabs => currentTabs.map(tab =>
          tab.id === leftActiveId ? { ...tab, title } : tab
        ));
      }

      const rightActiveId = rightActiveTabIdRef.current;
      const rightActiveTab = rightActiveId
        ? rightTabsRef.current.find(tab => tab.id === rightActiveId)
        : undefined;
      if (rightActiveTab?.type === 'ai-chat') {
        setRightTabs(currentTabs => currentTabs.map(tab =>
          tab.id === rightActiveId ? { ...tab, title } : tab
        ));
      }
    };

    window.addEventListener('open-file', handleOpenFile as EventListener);
    window.addEventListener('editor:replace-active-tab-content', handleReplaceActiveTabContent as EventListener);
    window.addEventListener('open-settings', handleOpenSettings);
    window.addEventListener('open-media-panel', handleOpenMediaPanel);
    window.addEventListener('open-extension-manager', handleOpenExtensionManager);
    window.addEventListener('open-lancedb-view', handleOpenLanceDBView);
    window.addEventListener('open-table-designer', handleOpenTableDesigner as EventListener);
    window.addEventListener('open-form-view', handleOpenTableDesigner as EventListener);
    window.addEventListener('open-mermaid-designer', handleOpenMermaidDesigner as EventListener);
    window.addEventListener('open-skill-market', handleOpenSkillsMarket);
    window.addEventListener('open-decomposition-rules', handleOpenDecompositionRules as EventListener);
    window.addEventListener('open-prompt-management', handleOpenPromptManagement);
    window.addEventListener('open-settings-json', handleOpenSettingsJson as EventListener);
    window.addEventListener('show-markdown-preview', handleShowMarkdownPreview as EventListener);
    window.addEventListener('editor:update-active-tab-title', handleUpdateActiveTabTitle as EventListener);
    
    console.log('[EditorArea] ========== 鎵€鏈変簨浠剁洃鍚櫒宸叉敞鍐?==========');
    console.log('[EditorArea] open-file 鐩戝惉鍣?', handleOpenFile);

    // 鐩戝惉鍏抽棴鎵€鏈夌紪杈戝櫒浜嬩欢
    const handleCloseAllEditors = () => {
      console.log('[EditorArea] 关闭所有编辑器标签页');
      setTabs([]);
      setActiveTabId(null);
      setRightTabs([]);
      setRightActiveTabId(null);
      setLeftBottomTabs([]);
      setLeftBottomActiveTabId(null);
      setRightBottomTabs([]);
      setRightBottomActiveTabId(null);
      setIsSplitView(false);
      setLeftVerticalSplit(false);
      setRightVerticalSplit(false);
      setLeftWidth(null);
      setLeftTopHeight(null);
      setRightTopHeight(null);
      setRightColumnWidths({});
      setHasCustomizedHorizontalSplit(false);
      setFocusedPaneId('left-top');
    };
    window.addEventListener('close-all-editors', handleCloseAllEditors);

    // 鐩戝惉鍒囨崲缂栬緫鍣ㄧ被鍨嬩簨浠?
    const handleToggleEditorType = () => {
      setEditorType(prev => {
        if (prev === 'monaco') return 'codemirror';
        return 'monaco';
      });
    };
    window.addEventListener('toggle-editor-type', handleToggleEditorType);

    // 鐩戝惉璁剧疆缂栬緫鍣ㄧ被鍨嬩簨浠?
    const handleSetEditorType = (event: Event) => {
      const customEvent = event as CustomEvent<'monaco' | 'codemirror'>;
      setEditorType(customEvent.detail);
    };
    window.addEventListener('set-editor-type', handleSetEditorType as EventListener);
    
    return () => {
      window.removeEventListener('open-file', handleOpenFile as EventListener);
      window.removeEventListener('editor:replace-active-tab-content', handleReplaceActiveTabContent as EventListener);
      window.removeEventListener('open-settings', handleOpenSettings);
      window.removeEventListener('open-media-panel', handleOpenMediaPanel);
      window.removeEventListener('open-extension-manager', handleOpenExtensionManager);
      window.removeEventListener('open-lancedb-view', handleOpenLanceDBView);
      window.removeEventListener('open-table-designer', handleOpenTableDesigner as EventListener);
      window.removeEventListener('open-form-view', handleOpenTableDesigner as EventListener);
      window.removeEventListener('open-mermaid-designer', handleOpenMermaidDesigner as EventListener);
      window.removeEventListener('open-skill-market', handleOpenSkillsMarket);
      window.removeEventListener('open-decomposition-rules', handleOpenDecompositionRules as EventListener);
      window.removeEventListener('open-prompt-management', handleOpenPromptManagement);
      window.removeEventListener('open-settings-json', handleOpenSettingsJson as EventListener);
      window.removeEventListener('show-markdown-preview', handleShowMarkdownPreview as EventListener);
      window.removeEventListener('editor:update-active-tab-title', handleUpdateActiveTabTitle as EventListener);
      window.removeEventListener('close-all-editors', handleCloseAllEditors);
      window.removeEventListener('toggle-editor-type', handleToggleEditorType);
      window.removeEventListener('set-editor-type', handleSetEditorType as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 鐩戝惉琛ㄦ牸鍚嶇О鍙樻洿浜嬩欢锛堢嫭绔嬬殑 useEffect锛?
  useEffect(() => {
    const handleTableNameChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId: string; newName: string }>;
      const { formId, newName } = customEvent.detail || {};
      
      if (formId && newName) {
        setTabs(currentTabs => 
          currentTabs.map(tab => 
            tab.formId === formId 
              ? { ...tab, title: `琛ㄦ牸 - ${newName}` }
              : tab
          )
        );
      }
    };

    window.addEventListener('table-name-change', handleTableNameChange as EventListener);
    
    return () => {
      window.removeEventListener('table-name-change', handleTableNameChange as EventListener);
    };
  }, []);

  // 鐩戝惉鎵撳紑鐭ヨ瘑搴撲簨浠讹紙鐙珛鐨?useEffect锛屾棤渚濊禆锛?
  useEffect(() => {
    const handleOpenKnowledge = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        id: string;
        title: string;
        description?: string;
        items: any[];
        knowledgeData: any;
      }>;
      const { id, title, description, items } = customEvent.detail;
      
      setTabs(prev => {
        // 鏌ユ壘鏄惁宸插瓨鍦ㄧ煡璇嗗簱绫诲瀷鐨勬爣绛鹃〉锛堜笉鍖哄垎 id锛?
        const existingKnowledgeTab = prev.find(tab => tab.type === 'knowledge');
        
        // 鏍囩椤垫爣棰樺彧鏄剧ず鐭ヨ瘑搴撳悕绉帮紝涓嶅寘鍚厤缃彉鍖栨彁绀?
        const tabTitle = `鐭ヨ瘑搴?- ${title}`;
        
        if (existingKnowledgeTab) {
          // 濡傛灉宸插瓨鍦ㄧ煡璇嗗簱鏍囩椤碉紝鏇存柊鍏舵爣棰樺拰鏁版嵁
          setActiveTabId(existingKnowledgeTab.id);
          console.log('[EditorArea] 鏇存柊鐭ヨ瘑搴撴爣绛鹃〉:', tabTitle);
          return prev.map(tab => 
            tab.id === existingKnowledgeTab.id 
              ? { 
                  ...tab, 
                  title: tabTitle,
                  path: `knowledge:/${id}`,
                  knowledgeData: { id, items, description } 
                } 
              : tab
          );
        } else {
          // 鍒涘缓鏂扮殑鐭ヨ瘑搴撴爣绛鹃〉锛堥娆℃墦寮€锛?
          const newTab: EditorTab = {
            id: `knowledge-${Date.now()}`,
            title: tabTitle,
            path: `knowledge:/${id}`,
            isDirty: false,
            type: 'knowledge',
            knowledgeData: { id, items, description }
          };
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 鍒涘缓鐭ヨ瘑搴撴爣绛鹃〉:', tabTitle);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    
    return () => {
      window.removeEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    };
  }, []); // 鏃犱緷璧栵紝鍙敞鍐屼竴娆?

  // 鐩戝惉鍏抽棴鐭ヨ瘑搴撴爣绛鹃〉浜嬩欢
  useEffect(() => {
    const handleCloseKnowledgeTab = (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      setTabs(prev => {
        // 鏌ユ壘鍖归厤鐨勭煡璇嗗簱鏍囩椤?
        const knowledgeTab = prev.find(
          tab => tab.type === 'knowledge' && 
                 (tab.knowledgeData?.id === knowledgeId || tab.path === `knowledge:/${knowledgeId}`)
        );
        
        if (knowledgeTab) {
          console.log('[EditorArea] 鍏抽棴鐭ヨ瘑搴撴爣绛鹃〉:', knowledgeTab.title, '鐭ヨ瘑搴揑D:', knowledgeId);
          
          // 绉婚櫎鐭ヨ瘑搴撴爣绛鹃〉
          const remainingTabs = prev.filter(tab => tab.id !== knowledgeTab.id);
          
          // 浣跨敤鍑芥暟寮忔洿鏂版潵鑾峰彇鏈€鏂扮殑 activeTabId
          setActiveTabId(currentActiveTabId => {
            // 濡傛灉鍏抽棴鐨勬槸褰撳墠娲诲姩鏍囩锛岄渶瑕佸垏鎹㈠埌鍏朵粬鏍囩
            if (currentActiveTabId === knowledgeTab.id) {
              if (remainingTabs.length > 0) {
                // 鍒囨崲鍒版渶鍚庝竴涓爣绛鹃〉
                return remainingTabs[remainingTabs.length - 1].id;
              } else {
                // 娌℃湁鍏朵粬鏍囩椤典簡锛屾竻闄ゆ椿鍔ㄦ爣绛?
                return null;
              }
            }
            // 涓嶆槸娲诲姩鏍囩锛屼繚鎸佸綋鍓嶆椿鍔ㄦ爣绛句笉鍙?
            return currentActiveTabId;
          });
          
          return remainingTabs;
        }
        
        return prev;
      });
    };

    window.addEventListener('close-knowledge-tab', handleCloseKnowledgeTab as EventListener);
    
    return () => {
      window.removeEventListener('close-knowledge-tab', handleCloseKnowledgeTab as EventListener);
    };
  }, []); // 鏃犱緷璧栵紝鍙敞鍐屼竴娆?

  // 淇鍑芥暟锛氬皢杩涘害涓?100% 浣嗙姸鎬佷粛涓?processing 鐨勬枃浠舵洿鏂颁负 completed
  const fixProcessingFilesWith100Percent = useCallback(async (knowledgeBase: KnowledgeItem): Promise<boolean> => {
    if (!knowledgeBase.children) {
      return false;
    }
    
    // 閫掑綊鏌ユ壘鎵€鏈夐渶瑕佷慨澶嶇殑鏂囦欢锛堝寘鎷瓙鏂囦欢澶逛腑鐨勬枃浠讹級
    const collectFilesToFix = (items: KnowledgeItem[]): KnowledgeItem[] => {
      const filesToFix: KnowledgeItem[] = [];
      for (const item of items) {
        if (item.type === 'file' && 
            item.metadata?.processingStatus === 'processing' && 
            item.metadata?.processingProgress === 100 &&
            item.path) {
          filesToFix.push(item);
        }
        if (item.children && item.children.length > 0) {
          filesToFix.push(...collectFilesToFix(item.children));
        }
      }
      return filesToFix;
    };
    
    const filesToFix = collectFilesToFix(knowledgeBase.children);
    
    if (filesToFix.length > 0) {
      console.log('[EditorArea] 鍙戠幇闇€瑕佷慨澶嶇殑鏂囦欢锛坧rocessing 100%锛?', filesToFix.length);
      for (const file of filesToFix) {
        if (file.path) {
          try {
            await knowledgeBaseService.updateFileProcessingStatus(
              file.path,
              'completed',
              100
            );
            console.log('[EditorArea] 宸蹭慨澶嶆枃浠剁姸鎬?', file.title);
          } catch (error) {
            console.error('[EditorArea] 淇鏂囦欢鐘舵€佸け璐?', file.title, error);
          }
        }
      }
      return true; // 琛ㄧず鏈夋枃浠惰淇
    }
    return false; // 琛ㄧず娌℃湁鏂囦欢闇€瑕佷慨澶?
  }, []);

  // 缁勪欢鍒濆鍖栨椂妫€鏌ュ苟淇鎵€鏈夌煡璇嗗簱涓殑 processing 100% 鏂囦欢
  useEffect(() => {
    const checkAndFixAllKnowledgeBases = async () => {
      try {
        const data = await knowledgeBaseService.loadFromStorage();
        let hasFixedAny = false;
        
        for (const knowledgeBase of data.created) {
          const hasFixed = await fixProcessingFilesWith100Percent(knowledgeBase);
          if (hasFixed) {
            hasFixedAny = true;
          }
        }
        
        if (hasFixedAny) {
          console.log('[EditorArea] 鍒濆鍖栨椂宸蹭慨澶嶆墍鏈夌煡璇嗗簱涓殑 processing 100% 鏂囦欢');
          // 瑙﹀彂鐭ヨ瘑搴撴洿鏂颁簨浠朵互鍒锋柊UI
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: 'all' }
          }));
        }
      } catch (error) {
        console.error('[EditorArea] 鍒濆鍖栨鏌ョ煡璇嗗簱鏂囦欢鐘舵€佸け璐?', error);
      }
    };
    
    checkAndFixAllKnowledgeBases();
  }, [fixProcessingFilesWith100Percent]);

  // 鐩戝惉鐭ヨ瘑搴撴洿鏂颁簨浠讹紙鍒锋柊鐭ヨ瘑搴撴暟鎹級
  useEffect(() => {
    const handleKnowledgeBaseUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      console.log('[EditorArea] 鐭ヨ瘑搴撳凡鏇存柊锛岄噸鏂板姞杞芥暟鎹?', knowledgeId);
      
      // 閲嶆柊鍔犺浇鐭ヨ瘑搴撴暟鎹?
      const data = await knowledgeBaseService.loadFromStorage();
      
      // 璋冭瘯锛氭鏌ユ暟鎹腑鏄惁鍖呭惈澶勭悊鐘舵€?
      const knowledgeBase = data.created.find(kb => kb.id === knowledgeId);
      if (knowledgeBase && knowledgeBase.children) {
        const filesWithStatus = knowledgeBase.children.filter(
          (item: KnowledgeItem) => item.type === 'file' && item.metadata?.processingStatus
        );
        console.log('[EditorArea] 鎵惧埌甯﹀鐞嗙姸鎬佺殑鏂囦欢:', filesWithStatus.length, filesWithStatus.map(item => ({
          title: item.title,
          status: item.metadata?.processingStatus,
          progress: item.metadata?.processingProgress
        })));
        
        // 鑷姩淇锛氬皢杩涘害涓?100% 浣嗙姸鎬佷粛涓?processing 鐨勬枃浠舵洿鏂颁负 completed
        const hasFixed = await fixProcessingFilesWith100Percent(knowledgeBase);
        if (hasFixed) {
          // 閲嶆柊鍔犺浇鏁版嵁浠ュ弽鏄犱慨澶嶅悗鐨勭姸鎬?
          const fixedData = await knowledgeBaseService.loadFromStorage();
          // 鏇存柊 data 寮曠敤
          Object.assign(data, fixedData);
        }
      }
      
      // 鏇存柊宸︿晶瀵瑰簲鐨勭煡璇嗗簱鏍囩椤垫暟鎹?
      setTabs(prev => {
        const updated = prev.map(tab => {
          if (tab.type === 'knowledge' && tab.knowledgeData?.id === knowledgeId) {
            // 鏌ユ壘鐭ヨ瘑搴撻」锛岃幏鍙栫煡璇嗗簱鍚嶇О
            const knowledgeBase = data.created.find(kb => kb.id === knowledgeId);
            const baseTitle = knowledgeBase?.title || '';
            const configChanged = knowledgeBase?.metadata?.configChanged;
            // 鏍囩椤垫爣棰樺彧鏄剧ず鐭ヨ瘑搴撳悕绉帮紝涓嶅寘鍚厤缃彉鍖栨彁绀?
            const newTitle = `鐭ヨ瘑搴?- ${baseTitle}`;
            
            const newTab = {
              ...tab,
              title: newTitle,
              knowledgeData: {
                id: knowledgeId,
                items: data.created,
                description: tab.knowledgeData?.description // 淇濈暀鍘熸湁鎻忚堪
              }
            };
            console.log('[EditorArea] 鏇存柊宸︿晶鐭ヨ瘑搴撴爣绛鹃〉鏁版嵁:', {
              tabId: tab.id,
              knowledgeId,
              itemsCount: data.created.length,
              configChanged,
              newTitle,
              hasProcessingFiles: data.created.some(kb => 
                kb.children?.some((item: KnowledgeItem) => 
                  item.type === 'file' && item.metadata?.processingStatus && item.metadata.processingStatus !== 'completed'
                )
              )
            });
            return newTab;
          }
          return tab;
        });
        return updated;
      });
      
      // 鏇存柊鍙充晶瀵瑰簲鐨勭煡璇嗗簱鏍囩椤垫暟鎹?
      setRightTabs(prev => {
        const updated = prev.map(tab => {
          if (tab.type === 'knowledge' && tab.knowledgeData?.id === knowledgeId) {
            // 鏌ユ壘鏇存柊鍚庣殑鐭ヨ瘑搴撴暟鎹?
            const updatedKnowledgeBase = data.created.find(kb => kb.id === knowledgeId);
            const baseTitle = updatedKnowledgeBase?.title || '';
            const configChanged = updatedKnowledgeBase?.metadata?.configChanged;
            // 鏍囩椤垫爣棰樺彧鏄剧ず鐭ヨ瘑搴撳悕绉帮紝涓嶅寘鍚厤缃彉鍖栨彁绀?
            const newTitle = `鐭ヨ瘑搴?- ${baseTitle}`;
            
            const newTab = {
              ...tab,
              title: newTitle,
              knowledgeData: {
                id: knowledgeId,
                items: data.created,
                description: tab.knowledgeData?.description // 淇濈暀鍘熸湁鎻忚堪
              }
            };
            console.log('[EditorArea] 鏇存柊鍙充晶鐭ヨ瘑搴撴爣绛鹃〉鏁版嵁:', {
              tabId: tab.id,
              knowledgeId,
              itemsCount: data.created.length,
              knowledgeBaseFound: !!updatedKnowledgeBase,
              configChanged,
              newTitle,
              childrenCount: updatedKnowledgeBase?.children?.length || 0,
              hasProcessingFiles: updatedKnowledgeBase?.children?.some((item: KnowledgeItem) => 
                item.type === 'file' && item.metadata?.processingStatus && item.metadata.processingStatus !== 'completed'
              ) || false
            });
            return newTab;
          }
          return tab;
        });
        return updated;
      });
    };

    window.addEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    
    return () => {
      window.removeEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    };
  }, []);

  // 鐩戝惉鎵撳紑 AI 閰嶇疆浜嬩欢锛堢嫭绔嬬殑 useEffect锛屾棤渚濊禆锛?
  useEffect(() => {
    const handleOpenAIConfig = async (event: Event) => {
      const customEvent = event as CustomEvent<{ configId?: string; configIndex?: number }>;
      // 浼樺厛浣跨敤 configId锛屽鏋滄病鏈夊垯浣跨敤 configIndex锛堝悜鍚庡吋瀹癸級
      const configId = customEvent?.detail?.configId;
      const configIndex = customEvent?.detail?.configIndex;
      
      console.log('[EditorArea] 鎵撳紑 AI 閰嶇疆锛岄厤缃甀D:', configId, '閰嶇疆绱㈠紩(搴熷純):', configIndex);
      
      // 濡傛灉娌℃湁 configId锛屽皾璇曚粠 configIndex 鑾峰彇閰嶇疆淇℃伅
      let actualConfigId = configId;
      let configName = 'AI 妯″瀷閰嶇疆';
      
      if (!actualConfigId && configIndex !== undefined) {
        try {
          const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
          if (configs && configs[configIndex]) {
            actualConfigId = configs[configIndex].id;
            configName = configs[configIndex].name || configName;
          }
        } catch (error) {
          console.error('[EditorArea] 浠庣储寮曡幏鍙栭厤缃甀D澶辫触:', error);
        }
      }
      
      // 濡傛灉娌℃湁 configId 涔熸病鏈?configIndex锛屽垱寤烘柊閰嶇疆
      if (!actualConfigId) {
        console.log('[EditorArea] 没有配置ID，创建新的 AI 配置标签页');
        const tempConfigId = `temp-config-${Date.now()}`;
        
        setTabs(prev => {
          const newTab: EditorTab = {
            id: `ai-config-${Date.now()}`,
            title: '鏂板缓閰嶇疆',
            path: `ai-config:/${tempConfigId}`,
            isDirty: false,
            type: 'ai-config',
            configId: tempConfigId
          };
          
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 鍒涘缓鏂扮殑 AI 閰嶇疆鏍囩椤垫垚鍔燂紝鏍囩ID:', newTab.id);
          return [...prev, newTab];
        });
        return;
      }
      
      // 鑾峰彇閰嶇疆淇℃伅锛堢敤浜庢爣棰橈級
      if (configId && !configName) {
        try {
          const config = await window.electron?.ipcRenderer.invoke('ai-model:get', actualConfigId);
          if (config && config.name) {
            configName = config.name;
          }
        } catch (error) {
          console.error('[EditorArea] 鑾峰彇閰嶇疆鍚嶇О澶辫触:', error);
        }
      }
      
      setTabs(prev => {
        // 鏌ユ壘鏄惁宸插瓨鍦ㄧ浉鍚宑onfigId鐨凙I閰嶇疆鏍囩椤?
        const existingAIConfigTab = prev.find(tab => 
          tab.type === 'ai-config' && tab.configId === actualConfigId
        );
        
        if (existingAIConfigTab) {
          // 濡傛灉宸插瓨鍦ㄧ浉鍚岀殑AI閰嶇疆鏍囩椤碉紝鐩存帴婵€娲诲畠
          setActiveTabId(existingAIConfigTab.id);
          console.log('[EditorArea] 婵€娲诲凡瀛樺湪鐨?AI 閰嶇疆鏍囩椤碉紝閰嶇疆ID:', actualConfigId, '鏍囩ID:', existingAIConfigTab.id);
          return prev; // 涓嶄慨鏀?tabs
        } else {
          // 涓嶅瓨鍦ㄧ浉鍚岀殑AI閰嶇疆鏍囩椤碉紝鍒涘缓鏂扮殑
          console.log('[EditorArea] 鍒涘缓鏂扮殑 AI 閰嶇疆鏍囩椤碉紝閰嶇疆ID:', actualConfigId, '閰嶇疆鍚嶇О:', configName);
          
          const tabPath = `ai-config:/${actualConfigId}`;
          const newTab: EditorTab = {
            id: `ai-config-${Date.now()}`,
            title: `閰嶇疆 - ${configName}`,
            path: tabPath,
            isDirty: false,
            type: 'ai-config',
            configId: actualConfigId,
            configIndex // 淇濈暀鐢ㄤ簬鍚戝悗鍏煎
          };
          
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 鍒涘缓鏂扮殑 AI 閰嶇疆鏍囩椤垫垚鍔燂紝鏍囩ID:', newTab.id);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-ai-config', handleOpenAIConfig as EventListener);
    
    return () => {
      window.removeEventListener('open-ai-config', handleOpenAIConfig as EventListener);
    };
  }, []); // 鏃犱緷璧栵紝鍙敞鍐屼竴娆?

  // 鐩戝惉 AI 閰嶇疆淇濆瓨浜嬩欢锛屾洿鏂颁复鏃堕厤缃殑 ID
  useEffect(() => {
    const handleAIConfigSaved = (event: Event) => {
      const customEvent = event as CustomEvent<{ tempId: string; realId: string; configName: string }>;
      const { tempId, realId, configName } = customEvent.detail;
      
      console.log('[EditorArea] 鏀跺埌 AI 閰嶇疆淇濆瓨浜嬩欢锛屾洿鏂颁复鏃堕厤缃甀D:', { tempId, realId, configName });
      
      setTabs(prev => {
        return prev.map(tab => {
          if (tab.type === 'ai-config' && tab.configId === tempId) {
            console.log('[EditorArea] 鏇存柊鏍囩椤?configId:', { oldId: tempId, newId: realId });
            return {
              ...tab,
              configId: realId,
              title: `閰嶇疆 - ${configName}`
            };
          }
          return tab;
        });
      });
      
      // 浠庢湭淇濆瓨鍒楄〃涓Щ闄わ紙浣跨敤鏂扮殑 realId锛?
      setUnsavedConfigTabs(prev => {
        const newSet = new Set(prev);
        newSet.delete(tempId);
        newSet.delete(realId);
        return newSet;
      });
    };

    window.addEventListener('ai-config-saved', handleAIConfigSaved as EventListener);
    return () => window.removeEventListener('ai-config-saved', handleAIConfigSaved as EventListener);
  }, []);

  // 鐩戝惉 AI 閰嶇疆鏈繚瀛樼姸鎬佸彉鍖?
  useEffect(() => {
    const handleUnsavedStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{ configId: string; hasUnsavedChanges: boolean }>;
      const { configId, hasUnsavedChanges } = customEvent.detail;
      
      console.log('[EditorArea] 鏀跺埌 AI 閰嶇疆鏈繚瀛樼姸鎬?', { configId, hasUnsavedChanges });
      
      setUnsavedConfigTabs(prev => {
        const newSet = new Set(prev);
        if (hasUnsavedChanges) {
          newSet.add(configId);
        } else {
          newSet.delete(configId);
        }
        return newSet;
      });
    };

    window.addEventListener('ai-config-unsaved-status', handleUnsavedStatus as EventListener);
    return () => window.removeEventListener('ai-config-unsaved-status', handleUnsavedStatus as EventListener);
  }, []);

  // 鐩戝惉 AI 閰嶇疆鏇存柊浜嬩欢锛屾洿鏂版爣绛鹃〉鏍囬锛堢嫭绔嬬殑 useEffect锛屾棤渚濊禆锛?
  useEffect(() => {
    const handleAIConfigUpdated = async () => {
      try {
        console.log('[EditorArea] 鏀跺埌 AI 閰嶇疆鏇存柊浜嬩欢锛屽紑濮嬫洿鏂版爣绛鹃〉鏍囬');
        
        // 鑾峰彇鏈€鏂扮殑閰嶇疆鍒楄〃
        const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
        if (!configs || configs.length === 0) {
          console.log('[EditorArea] 未获取到配置列表，跳过标题更新');
          return;
        }
        
        // 鍒涘缓閰嶇疆ID鍒伴厤缃璞＄殑鏄犲皠
        const configMap = new Map<string, { id: string; name: string }>(
          configs.map((c: { id: string; name: string }) => [c.id, c])
        );
        
        // 鏇存柊鎵€鏈?AI 閰嶇疆鏍囩椤电殑鏍囬
        setTabs(prev => {
          const updated = prev.map(tab => {
            if (tab.type === 'ai-config') {
              // 浼樺厛浣跨敤 configId
              if (tab.configId) {
                const config = configMap.get(tab.configId);
                if (config?.name) {
                  const newTitle = `閰嶇疆 - ${config.name}`;
                  console.log('[EditorArea] 鏇存柊鏍囩椤垫爣棰?閫氳繃configId):', { oldTitle: tab.title, newTitle, configId: tab.configId });
                  return { ...tab, title: newTitle };
                }
              } 
              // 鍚戝悗鍏煎锛氬鏋滄病鏈?configId锛屼娇鐢?configIndex
              else if (tab.configIndex !== undefined) {
                const config = configs[tab.configIndex];
                if (config?.name) {
                  const newTitle = `閰嶇疆 - ${config.name}`;
                  console.log('[EditorArea] 鏇存柊鏍囩椤垫爣棰?閫氳繃configIndex):', { oldTitle: tab.title, newTitle, configIndex: tab.configIndex });
                  // 鍚屾椂鏇存柊 configId 浠ヤ究鍚庣画浣跨敤
                  return { ...tab, title: newTitle, configId: config.id };
                }
              }
            }
            return tab;
          });
          return updated;
        });
        
        console.log('[EditorArea] AI 配置标签页标题更新完成');
      } catch (error) {
        console.error('[EditorArea] 鏇存柊 AI 閰嶇疆鏍囩椤垫爣棰樺け璐?', error);
      }
    };

    window.addEventListener('ai-config-updated', handleAIConfigUpdated);
    
    // 鐩戝惉 IPC 娑堟伅锛堢敤浜庝富杩涚▼閫氱煡鐨勬洿鏂帮級
    const ipcRenderer = window.electron?.ipcRenderer;
    if (ipcRenderer) {
      ipcRenderer.on('ai-model-config-updated', handleAIConfigUpdated);
    }
    
    return () => {
      window.removeEventListener('ai-config-updated', handleAIConfigUpdated);
      if (ipcRenderer) {
        ipcRenderer.removeListener('ai-model-config-updated', handleAIConfigUpdated);
      }
    };
  }, []); // 鏃犱緷璧栵紝鍙敞鍐屼竴娆?

  // 褰撴椿鍔ㄦ爣绛炬敼鍙樻椂锛岄€氱煡鏂囦欢鏍戞洿鏂伴€変腑鐘舵€?
  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    const previousTabsLength = previousTabsLengthRef.current;
    const previousActiveTabId = previousActiveTabIdRef.current;
    const overrideReason = tabChangeReasonOverrideRef.current;
    let reason: EditorTabsChangeReason = overrideReason || 'update';

    if (!overrideReason) {
      if (tabs.length > previousTabsLength) {
        reason = 'open';
      } else if (tabs.length < previousTabsLength) {
        reason = 'close';
      } else if (activeTabId !== previousActiveTabId) {
        reason = 'switch';
      }
    }

    const tabsStateDetail: EditorTabsStateDetail = {
      reason,
      tabs: tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        path: tab.path,
        type: tab.type,
        isPreview: tab.isPreview
      })),
      activeTabId
    };

    // Expose a stable tabs snapshot for components that mount later.
    (window as any).__editorTabsState = tabsStateDetail;
    window.dispatchEvent(new CustomEvent('editor:tabs-state-changed', {
      detail: tabsStateDetail
    }));
    
    if (activeTab && activeTab.type === 'file' && activeTab.path) {
      // 娲惧彂鑷畾涔変簨浠讹紝閫氱煡鏂囦欢鏍戝綋鍓嶆縺娲荤殑鏂囦欢
      window.dispatchEvent(new CustomEvent('editor-active-file-change', {
        detail: { path: activeTab.path }
      }));
    }
    tabChangeReasonOverrideRef.current = null;
    previousTabsLengthRef.current = tabs.length;
    previousActiveTabIdRef.current = activeTabId;
  }, [activeTabId, tabs]);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // 褰撴椿鍔ㄦ爣绛鹃〉鍙樺寲鏃讹紝閫氱煡鐘舵€佹爮鏇存柊璇█绫诲瀷
  useEffect(() => {
    if (activeTab?.language) {
      const event = new CustomEvent('tab:language-changed', {
        detail: { language: activeTab.language }
      });
      window.dispatchEvent(event);
    }
  }, [activeTab?.language, activeTabId]);

  // 澶勭悊鏍囩椤靛垏鎹?
  const handleTabClick = (tabId: string) => {
    tabChangeReasonOverrideRef.current = 'switch';
    setActiveTabId(tabId);
    setFocusedPaneId('left-top');
    
    // 閫氱煡 FileExplorer 鏇存柊閫変腑鐘舵€侊紙浠呴拡瀵规枃浠剁被鍨嬬殑鏍囩椤碉級
    const clickedTab = tabs.find(tab => tab.id === tabId);
    if (clickedTab?.type === 'file' && clickedTab?.path) {
      window.dispatchEvent(new CustomEvent('tab-switched', {
        detail: { path: clickedTab.path }
      }));
      console.log('[EditorArea] 鏍囩椤靛垏鎹?', clickedTab.path);
    }
    
    // 濡傛灉鏄〃鏍艰璁″櫒鏍囩椤碉紝閫氱煡渚ц竟鏍忔洿鏂拌〃鍗曢€変腑鐘舵€?
    if (clickedTab?.type === 'table-designer' && clickedTab?.formId) {
      window.dispatchEvent(new CustomEvent('form-tab-activated', {
        detail: { formId: clickedTab.formId }
      }));
    } else {
      // 闈炶〃鏍艰璁″櫒鏍囩椤碉紝娓呴櫎琛ㄥ崟閫変腑鐘舵€?
      window.dispatchEvent(new Event('form-tab-deactivated'));
    }
  };

  const handleSplit = (tabId: string, direction: SplitDirection) => {
    const located = findPaneByTabId(tabId);
    if (!located || located.tab.type !== 'file') {
      return;
    }

    const sourcePaneId = located.paneId;
    let targetPaneId: EditorPaneId = sourcePaneId;

    if (direction === 'horizontal') {
      setIsSplitView(true);
      targetPaneId = sourcePaneId === 'left-top'
        ? 'right-top'
        : sourcePaneId === 'left-bottom'
          ? (rightVerticalSplit ? 'right-bottom' : 'right-top')
          : sourcePaneId === 'right-top'
            ? 'left-top'
            : (leftVerticalSplit ? 'left-bottom' : 'left-top');
    } else {
      if (sourcePaneId === 'left-top' || sourcePaneId === 'left-bottom') {
        setLeftVerticalSplit(true);
        targetPaneId = sourcePaneId === 'left-top' ? 'left-bottom' : 'left-top';
      } else {
        setIsSplitView(true);
        setRightVerticalSplit(true);
        targetPaneId = sourcePaneId === 'right-top' ? 'right-bottom' : 'right-top';
      }
    }

    moveTabToPane(tabId, targetPaneId);
  };

  const handleSplitHorizontal = (tabId: string) => {
    handleSplit(tabId, 'horizontal');
  };

  const handleSplitVertical = (tabId: string) => {
    handleSplit(tabId, 'vertical');
  };

  const handleOpenTabInNewWindow = (tabId: string) => {
    const sourceTab = findPaneByTabId(tabId)?.tab;
    if (!sourceTab || sourceTab.type !== 'file') {
      return;
    }

    toastService.info('暂不支持在新窗口打开，已为你在右侧分屏打开');
    handleSplitHorizontal(tabId);
  };

  const handleTabClose = (tabId: string) => {
    tabChangeReasonOverrideRef.current = 'close';
    const closingTab = tabs.find(tab => tab.id === tabId);
    disposeTabResources(closingTab);
    
    // 濡傛灉鏄?AI 閰嶇疆鏍囩椤碉紝妫€鏌ユ槸鍚︽湁鏈繚瀛樼殑鏇存敼
    if (closingTab?.type === 'ai-config' && closingTab.configId) {
      if (unsavedConfigTabs.has(closingTab.configId)) {
        // 鏄剧ず纭瀵硅瘽妗?
        const confirmed = window.confirm(
          '您有未保存的更改，关闭后将丢失。\n\n确定要关闭吗？'
        );
        
        if (!confirmed) {
          console.log('[EditorArea] 鐢ㄦ埛鍙栨秷鍏抽棴鏈繚瀛樼殑閰嶇疆');
          return; // 鐢ㄦ埛鍙栨秷鍏抽棴
        }
        
        // 鐢ㄦ埛纭鍏抽棴锛屼粠鏈繚瀛樺垪琛ㄤ腑绉婚櫎
        setUnsavedConfigTabs(prev => {
          const newSet = new Set(prev);
          newSet.delete(closingTab.configId!);
          return newSet;
        });
      }
    }
    
    // 濡傛灉鏄〃鏍艰璁″櫒鏍囩椤碉紝鑷姩淇濆瓨鏁版嵁
    if (closingTab?.type === 'table-designer' && closingTab.formId) {
      saveAndRemoveTableDataService(closingTab.formId).then(success => {
        if (success) {
          console.log('[EditorArea] 琛ㄦ牸鏁版嵁鑷姩淇濆瓨鎴愬姛:', closingTab.formId);
        } else {
          console.warn('[EditorArea] 琛ㄦ牸鏁版嵁鑷姩淇濆瓨澶辫触:', closingTab.formId);
        }
      });
    }
    
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    const nextTabHistory = removeTabIdFromHistory(tabActivationHistoryRef.current, tabId);
    tabActivationHistoryRef.current = nextTabHistory;
    setTabs(newTabs);
    
    // 閫氱煡 FileExplorer 绉婚櫎瀵瑰簲鐨勭紪杈戝櫒锛堜粎閽堝鏂囦欢绫诲瀷鐨勬爣绛鹃〉锛?
    if (closingTab?.type === 'file' && closingTab?.path) {
      window.dispatchEvent(new CustomEvent('remove-editor', {
        detail: { path: closingTab.path }
      }));
      console.log('[EditorArea] 閫氱煡 FileExplorer 绉婚櫎缂栬緫鍣?', closingTab.path);
    }
    
    // 濡傛灉鍏抽棴鐨勬槸 AI 閰嶇疆鏍囩椤碉紝閫氱煡渚ц竟鏍忔竻闄ら€変腑鐘舵€?
    if (closingTab?.type === 'ai-config') {
      window.dispatchEvent(new Event('ai-config-tab-closed'));
      console.log('[EditorArea] AI 閰嶇疆鏍囩椤靛凡鍏抽棴');
    }
    
    // 濡傛灉鍏抽棴鐨勬槸琛ㄦ牸璁捐鍣ㄦ爣绛鹃〉锛岄€氱煡渚ц竟鏍忔竻闄よ〃鍗曢€変腑鐘舵€?
    if (closingTab?.type === 'table-designer') {
      window.dispatchEvent(new CustomEvent('form-tab-closed', {
        detail: { formId: closingTab.formId }
      }));
    }
    
    if (activeTabId === tabId) {
      const nextActiveTabId = getMostRecentTabId(nextTabHistory, newTabs);
      setActiveTabId(nextActiveTabId);
      
      // 閫氱煡 FileExplorer 鏇存柊閫変腑鐘舵€佸埌涓嬩竴涓爣绛鹃〉
      const nextTab = nextActiveTabId
        ? newTabs.find(tab => tab.id === nextActiveTabId)
        : null;
      if (nextTab?.type === 'file' && nextTab.path) {
        window.dispatchEvent(new CustomEvent('tab-switched', {
          detail: { path: nextTab.path }
        }));
        console.log('[EditorArea] 鍏抽棴鍚庡垏鎹㈠埌涓嬩竴涓爣绛鹃〉:', nextTab.path);
      }
    }
    
    // 鍏抽棴婧愭枃妗ｆ椂锛屽悓鏃跺叧闂搴旂殑棰勮鏍囩椤?
    const newRightTabs = rightTabs.filter(
      tab => tab.sourceTabId !== tabId && tab.splitSourceTabId !== tabId
    );
    if (newRightTabs.length !== rightTabs.length) {
      const removedRightTabIds = new Set(
        rightTabs
          .filter(tab => tab.sourceTabId === tabId || tab.splitSourceTabId === tabId)
          .map(tab => tab.id)
      );
      const nextRightHistory = rightTabActivationHistoryRef.current.filter(id => !removedRightTabIds.has(id));
      rightTabActivationHistoryRef.current = nextRightHistory;
      setRightTabs(newRightTabs);
      
      // 濡傛灉鍏抽棴鐨勯瑙堟爣绛炬槸褰撳墠婵€娲荤殑锛屽垏鎹㈠埌绗竴涓?
      if (rightActiveTabId && !newRightTabs.find(tab => tab.id === rightActiveTabId)) {
        const nextRightActiveTabId = getMostRecentTabId(nextRightHistory, newRightTabs);
        if (nextRightActiveTabId) {
          setRightActiveTabId(nextRightActiveTabId);
        } else {
          setRightActiveTabId(null);
          // 鍙充晶娌℃湁鏍囩椤典簡锛屽叧闂垎鍓茶鍥?
          if (rightBottomTabs.length === 0 && extraRightSplitPanes.length === 0) {
            setIsSplitView(false);
          }
        }
      }
    }
  };

  const handleRightTabClose = (tabId: string) => {
    disposeTabResources(rightTabs.find(tab => tab.id === tabId));
    const newRightTabs = rightTabs.filter(tab => tab.id !== tabId);
    const nextRightHistory = removeTabIdFromHistory(rightTabActivationHistoryRef.current, tabId);
    rightTabActivationHistoryRef.current = nextRightHistory;
    setRightTabs(newRightTabs);
    
    if (rightActiveTabId === tabId) {
      const nextRightActiveTabId = getMostRecentTabId(nextRightHistory, newRightTabs);
      setRightActiveTabId(nextRightActiveTabId);
      if (!nextRightActiveTabId && rightBottomTabs.length === 0 && extraRightSplitPanes.length === 0) {
        setIsSplitView(false);
      }
    } else if (newRightTabs.length === 0 && rightBottomTabs.length === 0 && extraRightSplitPanes.length === 0) {
      setRightActiveTabId(null);
      // 鍙充晶娌℃湁鏍囩椤典簡锛屽叧闂垎鍓茶鍥?
      setIsSplitView(false);
    }
  };

  const handleLeftBottomTabClose = (tabId: string) => {
    disposeTabResources(leftBottomTabs.find(tab => tab.id === tabId));
    const newTabs = leftBottomTabs.filter(tab => tab.id !== tabId);
    const nextHistory = removeTabIdFromHistory(leftBottomTabActivationHistoryRef.current, tabId);
    leftBottomTabActivationHistoryRef.current = nextHistory;
    setLeftBottomTabs(newTabs);

    if (leftBottomActiveTabId === tabId) {
      const nextActive = getMostRecentTabId(nextHistory, newTabs);
      setLeftBottomActiveTabId(nextActive);
    }

    if (newTabs.length === 0) {
      setLeftVerticalSplit(false);
      setLeftBottomActiveTabId(null);
      setLeftTopHeight(null);
    }
  };

  const handleRightBottomTabClose = (tabId: string) => {
    disposeTabResources(rightBottomTabs.find(tab => tab.id === tabId));
    const newTabs = rightBottomTabs.filter(tab => tab.id !== tabId);
    const nextHistory = removeTabIdFromHistory(rightBottomTabActivationHistoryRef.current, tabId);
    rightBottomTabActivationHistoryRef.current = nextHistory;
    setRightBottomTabs(newTabs);

    if (rightBottomActiveTabId === tabId) {
      const nextActive = getMostRecentTabId(nextHistory, newTabs);
      setRightBottomActiveTabId(nextActive);
    }

    if (newTabs.length === 0) {
      setRightVerticalSplit(false);
      setRightBottomActiveTabId(null);
      setRightTopHeight(null);
      if (rightTabs.length === 0 && extraRightSplitPanes.length === 0) {
        setIsSplitView(false);
      }
    }
  };

  const handleRightTabClick = (tabId: string) => {
    setRightActiveTabId(tabId);
    setFocusedPaneId('right-top');

    const clickedTab = rightTabs.find(tab => tab.id === tabId);
    if (!clickedTab) {
      return;
    }

    if (clickedTab.splitSourceTabId) {
      tabChangeReasonOverrideRef.current = 'switch';
      setActiveTabId(clickedTab.splitSourceTabId);
    }
  };

  const handleLeftBottomTabClick = (tabId: string) => {
    setLeftBottomActiveTabId(tabId);
    setFocusedPaneId('left-bottom');
  };

  const handleRightBottomTabClick = (tabId: string) => {
    setRightBottomActiveTabId(tabId);
    setFocusedPaneId('right-bottom');
  };

  const closeTabByPane = useCallback((paneId: EditorPaneId, tabId: string) => {
    if (paneId === 'left-top') {
      handleTabClose(tabId);
      return;
    }
    if (paneId === 'left-bottom') {
      handleLeftBottomTabClose(tabId);
      return;
    }
    if (paneId === 'right-top') {
      handleRightTabClose(tabId);
      return;
    }
    handleRightBottomTabClose(tabId);
  }, [handleTabClose, handleLeftBottomTabClose, handleRightTabClose, handleRightBottomTabClose]);

  const closeMultipleTabsByPane = useCallback((paneId: EditorPaneId, tabIds: string[]) => {
    if (tabIds.length === 0) {
      return;
    }

    const existingPaneTabs = getPaneTabs(paneId);
    const targetIdSet = new Set(tabIds);
    const closingTabs = existingPaneTabs.filter(tab => targetIdSet.has(tab.id));
    if (closingTabs.length === 0) {
      return;
    }

    for (const tab of closingTabs) {
      disposeTabResources(tab);
      removeTabFromPane(paneId, tab.id);

      if (tab.type === 'file' && tab.path) {
        window.dispatchEvent(new CustomEvent('remove-editor', {
          detail: { path: tab.path }
        }));
      }

      if (tab.type === 'table-designer') {
        window.dispatchEvent(new CustomEvent('form-tab-closed', {
          detail: { formId: tab.formId }
        }));
      }
    }

    if (closingTabs.some(tab => tab.type === 'ai-config')) {
      window.dispatchEvent(new Event('ai-config-tab-closed'));
    }

    const nextTabs = existingPaneTabs.filter(tab => !targetIdSet.has(tab.id));
    const currentActiveTabId = getPaneActiveTabId(paneId);
    if (currentActiveTabId && targetIdSet.has(currentActiveTabId)) {
      const historyRef = getPaneHistoryRef(paneId);
      const nextActiveTabId = getMostRecentTabId(historyRef.current, nextTabs);
      setPaneActiveTabId(paneId, nextActiveTabId);
    }
  }, [
    disposeTabResources,
    getPaneTabs,
    removeTabFromPane,
    getPaneActiveTabId,
    getPaneHistoryRef,
    setPaneActiveTabId
  ]);

  const resolveDirectionalTargetPane = useCallback((sourcePaneId: EditorPaneId, direction: PaneMoveDirection): EditorPaneId | null => {
    if (direction === 'right') {
      if (sourcePaneId === 'left-top') return 'right-top';
      if (sourcePaneId === 'left-bottom') return 'right-bottom';
      return null;
    }
    if (direction === 'left') {
      if (sourcePaneId === 'right-top') return 'left-top';
      if (sourcePaneId === 'right-bottom') return 'left-bottom';
      return null;
    }
    if (direction === 'down') {
      if (sourcePaneId === 'left-top') return 'left-bottom';
      if (sourcePaneId === 'right-top') return 'right-bottom';
      return null;
    }
    if (sourcePaneId === 'left-bottom') return 'left-top';
    if (sourcePaneId === 'right-bottom') return 'right-top';
    return null;
  }, []);

  const prependExtraRightSplitPane = useCallback((sourcePath: string, excludePath?: string) => {
    if (!sourcePath) {
      return;
    }

    setIsSplitView(true);
    setExtraRightSplitPanes(prev => {
      const base = prev.filter(pane => !excludePath || pane.sourcePath !== excludePath);
      if (base.length === 0) {
        const paneId = `right-extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return [{ id: paneId, sourcePath }];
      }

      const existingIndex = base.findIndex(pane => pane.sourcePath === sourcePath);
      if (existingIndex === 0) {
        return base;
      }

      if (existingIndex > 0) {
        const reorderedPaths = [
          sourcePath,
          ...base.slice(0, existingIndex).map(pane => pane.sourcePath),
          ...base.slice(existingIndex + 1).map(pane => pane.sourcePath),
        ];
        return base.map((pane, index) => ({
          ...pane,
          sourcePath: reorderedPaths[index] ?? pane.sourcePath
        }));
      }

      const shifted = base.map((pane, index) => ({
        ...pane,
        sourcePath: index === 0 ? sourcePath : base[index - 1].sourcePath
      }));
      const paneId = `right-extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const carryPath = base[base.length - 1].sourcePath;
      return [...shifted, { id: paneId, sourcePath: carryPath }];
    });
  }, []);

  const closeExtraRightSplitPane = useCallback((paneId: string) => {
    setExtraRightSplitPanes(prev => prev.filter(pane => pane.id !== paneId));
  }, []);

  const splitTabToDirection = useCallback((tabId: string, direction: PaneMoveDirection) => {
    const located = findPaneByTabId(tabId);
    if (!located || located.tab.type !== 'file') {
      return;
    }

    if (direction === 'right') {
      const hasPrimaryRightPane =
        rightTabsRef.current.length > 0 ||
        rightBottomTabsRef.current.length > 0 ||
        extraRightSplitPanes.length > 0;
      if (!hasPrimaryRightPane) {
        ensurePaneVisibleForDrop('right-top');
        const splitTab: EditorTab = {
          ...located.tab,
          id: `split-${located.tab.id}-${Date.now()}`,
          isPreview: false,
        };
        setPaneTabs('right-top', prev => [...prev, splitTab]);
        setPaneActiveTabId('right-top', splitTab.id);
        setFocusedPaneId('right-top');
        return;
      }

      prependExtraRightSplitPane(located.tab.path);
      return;
    }

    const targetPaneId = resolveDirectionalTargetPane(located.paneId, direction);
    if (!targetPaneId) {
      toastService.info('当前方向无法分屏');
      return;
    }
    ensurePaneVisibleForDrop(targetPaneId);

    const existingInTarget = getPaneTabs(targetPaneId).find(tab =>
      tab.type === 'file' && tab.path === located.tab.path
    );
    if (existingInTarget) {
      setPaneActiveTabId(targetPaneId, existingInTarget.id);
      setFocusedPaneId(targetPaneId);
      return;
    }

    const splitTab: EditorTab = {
      ...located.tab,
      id: `split-${located.tab.id}-${Date.now()}`,
      isPreview: false,
    };

    setPaneTabs(targetPaneId, prev => [...prev, splitTab]);
    setPaneActiveTabId(targetPaneId, splitTab.id);
    setFocusedPaneId(targetPaneId);
  }, [
    prependExtraRightSplitPane,
    findPaneByTabId,
    resolveDirectionalTargetPane,
    getPaneTabs,
    ensurePaneVisibleForDrop,
    setPaneTabs,
    setPaneActiveTabId,
    extraRightSplitPanes.length
  ]);

  const moveTabByDirection = useCallback((tabId: string, direction: PaneMoveDirection) => {
    const located = findPaneByTabId(tabId);
    if (!located) {
      return;
    }

    const targetPaneId = resolveDirectionalTargetPane(located.paneId, direction);
    if (!targetPaneId) {
      toastService.info('当前方向无法移动');
      return;
    }

    moveTabToPane(tabId, targetPaneId);
  }, [findPaneByTabId, moveTabToPane, resolveDirectionalTargetPane]);

  const addTabToChatContext = useCallback((tabId: string) => {
    const located = findPaneByTabId(tabId);
    if (!located || located.tab.type !== 'file' || !located.tab.path) {
      return;
    }

    window.dispatchEvent(new Event('restore-ai-chat-panel'));
    window.dispatchEvent(new CustomEvent('ai-chat:add-file-context', {
      detail: {
        path: located.tab.path,
        name: located.tab.title,
      },
    }));
  }, [findPaneByTabId]);

  const openTabInSystemExplorer = useCallback(async (tabId: string) => {
    const located = findPaneByTabId(tabId);
    if (!located || located.tab.type !== 'file' || !located.tab.path) {
      return;
    }

    try {
      if (window.electron?.folder?.revealInExplorer) {
        await window.electron.folder.revealInExplorer(located.tab.path);
        return;
      }
      await window.electron?.ipcRenderer.invoke('open-in-explorer', located.tab.path);
    } catch (error) {
      console.error('[EditorArea] 在资源管理器中打开失败:', error);
    }
  }, [findPaneByTabId]);

  const revealTabInExplorerView = useCallback((tabId: string) => {
    const located = findPaneByTabId(tabId);
    if (!located || located.tab.type !== 'file' || !located.tab.path) {
      return;
    }

    window.dispatchEvent(new CustomEvent('tab-switched', {
      detail: { path: located.tab.path }
    }));
    window.dispatchEvent(new CustomEvent('file-tree-reveal', {
      detail: { path: located.tab.path }
    }));
  }, [findPaneByTabId]);

  const rightActiveTab = rightTabs.find(tab => tab.id === rightActiveTabId);
  const leftBottomActiveTab = leftBottomTabs.find(tab => tab.id === leftBottomActiveTabId);
  const rightBottomActiveTab = rightBottomTabs.find(tab => tab.id === rightBottomActiveTabId);

  const handleExtraRightPaneTabClick = useCallback((sourcePaneId: EditorPaneId, sourceTabId: string) => {
    setPaneActiveTabId(sourcePaneId, sourceTabId);
    setFocusedPaneId(sourcePaneId);
  }, [setPaneActiveTabId]);

  const handleExtraRightPaneSplitToDirection = useCallback((sourceTabId: string, direction: PaneMoveDirection) => {
    splitTabToDirection(sourceTabId, direction);
  }, [splitTabToDirection]);

  const handleExtraRightPaneMoveToDirection = useCallback((sourceTabId: string, direction: PaneMoveDirection) => {
    moveTabByDirection(sourceTabId, direction);
  }, [moveTabByDirection]);

  const getFocusedActiveTab = useCallback((): EditorTab | null => {
    if (focusedPaneId === 'left-top') {
      return tabs.find(tab => tab.id === activeTabId) || null;
    }
    if (focusedPaneId === 'left-bottom') {
      return leftBottomTabs.find(tab => tab.id === leftBottomActiveTabId) || null;
    }
    if (focusedPaneId === 'right-top') {
      return rightTabs.find(tab => tab.id === rightActiveTabId) || null;
    }
    return rightBottomTabs.find(tab => tab.id === rightBottomActiveTabId) || null;
  }, [
    focusedPaneId,
    tabs,
    activeTabId,
    leftBottomTabs,
    leftBottomActiveTabId,
    rightTabs,
    rightActiveTabId,
    rightBottomTabs,
    rightBottomActiveTabId
  ]);

  // 将当前活动文件同步到 note-system，供双向链接/反向链接查询使用
  useEffect(() => {
    let cancelled = false;

    const syncCurrentTabNote = async () => {
      const focusedTab = getFocusedActiveTab();
      if (!focusedTab || !isLinkableFile(focusedTab)) {
        setCurrentNote(null);
        resetLinkState();
        return;
      }

      try {
        const note = await getNoteByPath(focusedTab.path) || await syncFileTabToNoteSystem(focusedTab);
        if (cancelled) {
          return;
        }

        setCurrentNote(note);
        if (!note) {
          resetLinkState();
        }
      } catch (error) {
        console.error('[EditorArea] 同步当前文件到 note-system 失败:', error);
        if (!cancelled) {
          setCurrentNote(null);
          resetLinkState();
        }
      }
    };

    void syncCurrentTabNote();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab?.id,
    activeTab?.path,
    activeTab?.title,
    activeTab?.type,
    rightActiveTabId,
    leftBottomActiveTabId,
    rightBottomActiveTabId,
    focusedPaneId,
    getFocusedActiveTab,
    resetLinkState,
    setCurrentNote,
    syncFileTabToNoteSystem
  ]);

  // 淇濆瓨鏂囦欢鍑芥暟
  const saveFile = async (tab: EditorTab) => {
    if (!tab || tab.type !== 'file') {
      return;
    }

    // 濡傛灉鏄?settings.json锛屽凡缁忚嚜鍔ㄤ繚瀛橈紝涓嶉渶瑕佸啀娆′繚瀛?
    if (tab.path === 'settings:/settings.json') {
      updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
      return;
    }

    // 妫€鏌ユ槸鍚︽槸涓婚瑕嗙洊鏂囦欢锛坱heme-override:// 鍗忚锛?
    const isThemeOverride = tab.path.startsWith('theme-override://');
    
    // 濡傛灉鏄富棰樿鐩栨枃浠讹紝浣跨敤涓婚瑕嗙洊淇濆瓨API
    if (isThemeOverride) {
      try {
        console.log('[EditorArea] 澶勭悊涓婚瑕嗙洊鏂囦欢淇濆瓨:', tab.path);
        
        // 浠庤矾寰勬彁鍙栧熀纭€涓婚ID
        // 渚嬪锛歵heme-override://quiet-light.json 鈫?quiet-light
        const baseThemeId = tab.path.replace('theme-override://', '').replace('.json', '');
        console.log('[EditorArea] 鍩虹涓婚ID:', baseThemeId);
        
        // 瑙ｆ瀽棰滆壊瑕嗙洊鍐呭
        const parseErrors: jsonc.ParseError[] = [];
        const parsedConfig = jsonc.parse(tab.content || '', parseErrors, {
          allowTrailingComma: true,
          allowEmptyContent: false
        });
        
        // 妫€鏌ヨВ鏋愰敊璇?
        if (parseErrors.length > 0) {
          console.warn('[EditorArea] 主题覆盖配置 JSON 解析错误，仅清除脏标记');
          updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
          return;
        }
        
        // 楠岃瘉鏍煎紡锛氬繀椤诲寘鍚?colors 瀵硅薄
        if (!parsedConfig || !parsedConfig.colors) {
          console.warn('[EditorArea] 涓婚瑕嗙洊閰嶇疆缁撴瀯涓嶅畬鏁达紝闇€瑕佸寘鍚?colors 瀛楁');
          toastService.error('淇濆瓨澶辫触', {
            description: '涓婚瑕嗙洊鏂囦欢蹇呴』鍖呭惈 colors 瀛楁'
          });
          return;
        }
        
        console.log('[EditorArea] 鍑嗗淇濆瓨涓婚棰滆壊瑕嗙洊');
        console.log('[EditorArea] 鍩虹涓婚:', baseThemeId);
        console.log('[EditorArea] 瑕嗙洊棰滆壊鏁伴噺:', Object.keys(parsedConfig.colors || {}).length);
        
        // 璋冪敤 IPC 淇濆瓨涓婚瑕嗙洊鍒版枃浠剁郴缁?
        // 浼犻€掞細鍩虹涓婚ID + 瑕嗙洊鐨勯鑹?
        try {
          const result = await window.electron?.ipcRenderer.invoke('theme:save-override', {
            baseThemeId,
            colors: parsedConfig.colors || {}
          });
          
          if (result?.success) {
            console.log('[EditorArea] 鉁?涓婚瑕嗙洊宸叉垚鍔熶繚瀛?', baseThemeId);
            toastService.success('涓婚瑕嗙洊淇濆瓨鎴愬姛', {
              description: `已保存 ${Object.keys(parsedConfig.colors || {}).length} 个颜色覆盖`
            });
            // 娓呴櫎鑴忔爣璁帮紝琛ㄧず宸蹭繚瀛?
            updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
          } else {
            console.error('[EditorArea] 淇濆瓨涓婚瑕嗙洊澶辫触:', result?.error);
            toastService.error('淇濆瓨涓婚瑕嗙洊澶辫触', {
              description: result?.error || '鏈煡閿欒'
            });
          }
        } catch (error) {
          console.error('[EditorArea] 璋冪敤涓婚瑕嗙洊淇濆瓨 IPC 澶辫触:', error);
          toastService.error('淇濆瓨涓婚瑕嗙洊澶辫触', {
            description: error instanceof Error ? error.message : '璋冪敤淇濆瓨鎺ュ彛澶辫触'
          });
        }
      } catch (error) {
        console.error('[EditorArea] 澶勭悊涓婚瑕嗙洊淇濆瓨鏃跺彂鐢熼敊璇?', error);
        // 鍙戠敓閿欒鏃朵粛鐒舵竻闄よ剰鏍囪
        updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
      }
      return;
    }

    // 濡傛灉鏄棤璺緞鏂囦欢锛屼娇鐢ㄥ彟瀛樹负
    const requiresSaveAs = !tab.path || tab.path === '';
    if (requiresSaveAs) {
      try {
        let contentToSave = tab.content || '';
        if (isHtmlContent(contentToSave)) {
          contentToSave = htmlToMarkdown(contentToSave);
        }

        const result = await window.electron?.file?.saveAs(contentToSave);
        if (result?.success && result.data) {
          const syncedNote = await syncFileTabToNoteSystem(tab, {
            path: result.data.path,
            title: result.data.name,
            content: contentToSave,
            previousPath: tab.path
          });
          updateTabInAllPanes(tab.id, current => ({
            ...current,
            path: result.data!.path,
            title: result.data!.name,
            isDirty: false
          }));
          if (syncedNote) {
            setCurrentNote(syncedNote);
          }
        }
      } catch (error) {
        // 鍙﹀瓨涓烘枃浠跺け璐ワ紝闈欓粯澶勭悊
      }
      return;
    }

    // 淇濆瓨鏂囦欢
    try {
      // 濡傛灉鍐呭鏄?HTML 鏍煎紡锛岃浆鎹负 Markdown 淇濆瓨
      let contentToSave = tab.content || '';
      if (isHtmlContent(contentToSave)) {
        contentToSave = htmlToMarkdown(contentToSave);
      }
      
      const result = await window.electron?.file?.save(tab.path, contentToSave);
      if (result?.success) {
        const syncedNote = await syncFileTabToNoteSystem(tab, {
          path: tab.path,
          title: tab.title,
          content: contentToSave
        });
        // 娓呴櫎鑴忔爣璁?
        updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
        if (syncedNote) {
          setCurrentNote(syncedNote);
        }
      }
    } catch (error) {
      // 淇濆瓨鏂囦欢寮傚父锛岄潤榛樺鐞?
    }
  };

  // 鐩戝惉娲诲姩鏍囩椤靛彉鍖栵紝閫氱煡鐘舵€佹爮鍜屽ぇ绾?
  useEffect(() => {
    const currentActiveTab = getFocusedActiveTab();

    // 鍚屾鍏ㄥ眬褰撳墠鏍囩涓婁笅鏂囷紝渚?AI 闈㈡澘绛夊叏灞€缁勪欢璇诲彇
    (window as any).__currentTabTitle = currentActiveTab?.title || '';
    (window as any).__currentTabPath = currentActiveTab?.path || '';
    
    window.dispatchEvent(new CustomEvent('editor:active-tab-changed', {
      detail: {
        tabType: currentActiveTab?.type || null,
        isSettingsTab: currentActiveTab?.type === 'settings',
        isFileTab: currentActiveTab?.type === 'file',
        isAIConfigTab: currentActiveTab?.type === 'ai-config',
        language: currentActiveTab?.language,
        path: currentActiveTab?.path,
        title: currentActiveTab?.title || ''
      }
    }));

    // 閫氱煡澶х翰缁勪欢鏇存柊
    if (currentActiveTab && currentActiveTab.type === 'file') {
      window.dispatchEvent(new CustomEvent('editor:content-changed', {
        detail: {
          content: currentActiveTab.content || '',
          language: currentActiveTab.language || 'plaintext',
          path: currentActiveTab.path
        }
      }));
    } else {
      // 闈炴枃浠舵爣绛鹃〉锛屾竻绌哄ぇ绾?
      window.dispatchEvent(new CustomEvent('editor:content-changed', {
        detail: {
          content: '',
          language: 'plaintext',
          path: ''
        }
      }));
    }
  }, [activeTabId, tabs, rightActiveTabId, rightTabs, leftBottomActiveTabId, leftBottomTabs, rightBottomActiveTabId, rightBottomTabs, focusedPaneId, getFocusedActiveTab]);

  // 鐩戝惉淇濆瓨浜嬩欢
  useEffect(() => {
    const handleSaveFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const focusedTab = getFocusedActiveTab();
      const targetTabId = customEvent.detail?.tabId || focusedTab?.id || activeTabId;
      
      if (!targetTabId) {
        return;
      }

      // 鏌ユ壘瑕佷繚瀛樼殑鏍囩椤?
      const located = findPaneByTabId(targetTabId);
      if (located) {
        saveFile(located.tab);
      }
    };

    window.addEventListener('save-file', handleSaveFile as EventListener);
    
    return () => {
      window.removeEventListener('save-file', handleSaveFile as EventListener);
    };
  }, [tabs, activeTabId, rightTabs, leftBottomTabs, rightBottomTabs, getFocusedActiveTab, findPaneByTabId]);

  // 鐩戝惉鍏抽棴鏂囦欢浜嬩欢
  useEffect(() => {
    const handleCloseFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      const { path } = customEvent.detail;
      
      // 鏌ユ壘瀵瑰簲鐨勬爣绛鹃〉骞跺叧闂?
      const filePane = findPaneByPath(path, 'file');
      if (filePane) {
        closeTabByPane(filePane.paneId, filePane.tab.id);
      }
    };

    window.addEventListener('close-file', handleCloseFile as EventListener);
    
    return () => {
      window.removeEventListener('close-file', handleCloseFile as EventListener);
    };
  }, [tabs, rightTabs, leftBottomTabs, rightBottomTabs, findPaneByPath, closeTabByPane]);

  // 灏嗕繚瀛樺嚱鏁版毚闇插埌鍏ㄥ眬锛屼緵蹇嵎閿娇鐢?
  useEffect(() => {
    (window as any).__editorSaveFile = () => {
      const focusedTab = getFocusedActiveTab();
      if (focusedTab) {
        saveFile(focusedTab);
      }
    };

    return () => {
      delete (window as any).__editorSaveFile;
    };
  }, [tabs, activeTabId, rightTabs, leftBottomTabs, rightBottomTabs, getFocusedActiveTab]);

  const handleResizeMainSplit = useCallback((primarySize: number) => {
    setHasCustomizedHorizontalSplit(true);
    setLeftWidth(primarySize);
  }, []);

  const leftColumnStyle: React.CSSProperties | undefined = (() => {
    if (!isSplitView) {
      return undefined;
    }
    if (hasCustomizedHorizontalSplit && leftWidth !== null) {
      return { width: `${leftWidth}px`, flex: 'none' };
    }
    // 默认等分：未拖动主分隔线时，左侧也参与平均分配宽度。
    return {
      flex: '1 1 0',
      width: 'auto',
      minWidth: 0,
      minHeight: 0,
    };
  })();
  const leftTopStyle = leftVerticalSplit && leftTopHeight !== null
    ? { height: `${leftTopHeight}px`, flex: 'none' }
    : undefined;
  const rightTopStyle = rightVerticalSplit && rightTopHeight !== null
    ? { height: `${rightTopHeight}px`, flex: 'none' }
    : undefined;
  const isMainRightPaneVisible = rightTabs.length > 0 || rightBottomTabs.length > 0 || extraRightSplitPanes.length === 0;
  const visibleRightColumnIds = [
    ...extraRightSplitPanes.map(pane => pane.id),
    ...(isMainRightPaneVisible ? ['right-main'] : [])
  ];
  const trailingRightColumnId = visibleRightColumnIds[visibleRightColumnIds.length - 1] ?? null;
  const horizontalSplitStructureKey = isSplitView
    ? `split:${visibleRightColumnIds.join('|')}`
    : 'single';

  const getRightColumnStyle = useCallback((columnId: string): React.CSSProperties => {
    if (trailingRightColumnId === columnId) {
      return {
        flex: '1 1 0',
        width: 'auto',
        minWidth: 0,
        minHeight: 0
      };
    }

    const width = hasCustomizedHorizontalSplit ? rightColumnWidths[columnId] : undefined;
    if (typeof width === 'number' && width > 0) {
      return {
        width: `${width}px`,
        flex: 'none',
        minWidth: 0,
        minHeight: 0
      };
    }
    return {
      flex: '1 1 0',
      width: 'auto',
      minWidth: 0,
      minHeight: 0
    };
  }, [hasCustomizedHorizontalSplit, rightColumnWidths, trailingRightColumnId]);

  const handleResizeRightPanePair = useCallback((
    leftColumnId: string,
    rightColumnId: string,
    leftSize: number,
    rightSize?: number
  ) => {
    if (typeof rightSize !== 'number') {
      return;
    }
    setHasCustomizedHorizontalSplit(true);
    setRightColumnWidths(prev => ({
      ...prev,
      [leftColumnId]: leftSize,
      [rightColumnId]: rightSize
    }));
  }, []);

  useEffect(() => {
    const previousKey = previousHorizontalSplitStructureKeyRef.current;
    previousHorizontalSplitStructureKeyRef.current = horizontalSplitStructureKey;
    if (previousKey === null || previousKey === horizontalSplitStructureKey) {
      return;
    }
    setLeftWidth(null);
    setRightColumnWidths({});
    setHasCustomizedHorizontalSplit(false);
  }, [horizontalSplitStructureKey]);

  useEffect(() => {
    if (hasCustomizedHorizontalSplit) {
      return;
    }
    setLeftWidth(prev => (prev === null ? prev : null));
    setRightColumnWidths(prev => (Object.keys(prev).length === 0 ? prev : {}));
  }, [hasCustomizedHorizontalSplit]);

  useEffect(() => {
    const container = editorGroupsRef.current;
    if (!container) {
      return;
    }

    const horizontalDividerSize = 8;
    const minLeftWidth = 300;
    const minRightWidth = 300;
    const minTrailingRightColumnWidth = 160;
    const minFixedRightColumnWidth = 120;

    const clampEditorLayoutSizes = () => {
      const containerWidth = container.clientWidth;
      if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
        return;
      }

      let effectiveLeftWidth = containerWidth;
      if (isSplitView) {
        const maxLeftWidth = Math.max(minLeftWidth, containerWidth - horizontalDividerSize - minRightWidth);
        const fallbackLeftWidth = Math.max(
          minLeftWidth,
          Math.min(maxLeftWidth, Math.floor((containerWidth - horizontalDividerSize) / 2))
        );
        const currentLeft = hasCustomizedHorizontalSplit && leftWidth !== null
          ? leftWidth
          : fallbackLeftWidth;
        const clampedLeft = Math.min(Math.max(currentLeft, minLeftWidth), maxLeftWidth);
        effectiveLeftWidth = clampedLeft;

        setLeftWidth(prev => {
          if (!hasCustomizedHorizontalSplit || prev === null) {
            return prev;
          }
          return Math.abs(prev - clampedLeft) < 0.5 ? prev : clampedLeft;
        });
      }

      const visibleColumns = [
        ...extraRightSplitPanes.map(pane => pane.id),
        ...(isMainRightPaneVisible ? ['right-main'] : []),
      ];
      if (visibleColumns.length <= 1) {
        return;
      }

      const trailingColumnId = visibleColumns[visibleColumns.length - 1];
      const fixedColumnIds = visibleColumns.filter(id => id !== trailingColumnId);
      if (fixedColumnIds.length === 0) {
        return;
      }
      if (!hasCustomizedHorizontalSplit) {
        return;
      }

      const rightAreaWidth = isSplitView
        ? Math.max(minRightWidth, containerWidth - horizontalDividerSize - effectiveLeftWidth)
        : containerWidth;
      const reservedDividerSpace = horizontalDividerSize * Math.max(0, fixedColumnIds.length);
      const maxFixedColumnsTotalWidth = Math.max(
        minFixedRightColumnWidth * fixedColumnIds.length,
        rightAreaWidth - minTrailingRightColumnWidth - reservedDividerSpace
      );

      setRightColumnWidths(prev => {
        const currentFixedWidths = fixedColumnIds
          .map(id => prev[id])
          .filter((value): value is number => typeof value === 'number' && value > 0);
        if (currentFixedWidths.length === 0) {
          return prev;
        }

        const currentTotalWidth = currentFixedWidths.reduce((sum, value) => sum + value, 0);
        if (currentTotalWidth <= maxFixedColumnsTotalWidth) {
          return prev;
        }

        const scale = maxFixedColumnsTotalWidth / currentTotalWidth;
        let changed = false;
        const next: Record<string, number> = { ...prev };

        fixedColumnIds.forEach(id => {
          const currentWidth = prev[id];
          if (typeof currentWidth !== 'number' || currentWidth <= 0) {
            return;
          }
          const scaledWidth = Math.max(minFixedRightColumnWidth, Math.floor(currentWidth * scale));
          if (scaledWidth !== currentWidth) {
            next[id] = scaledWidth;
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    };

    clampEditorLayoutSizes();

    const observer = new ResizeObserver(() => {
      clampEditorLayoutSizes();
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [
    isSplitView,
    leftWidth,
    hasCustomizedHorizontalSplit,
    extraRightSplitPanes,
    isMainRightPaneVisible,
  ]);

  const readDraggedTabPayload = (event: React.DragEvent<HTMLElement>): { tabId: string; sourceGroupId: EditorPaneId } | null => {
    const raw = event.dataTransfer.getData(TAB_DRAG_MIME);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as { tabId?: string; sourceGroupId?: EditorPaneId };
      if (!parsed.tabId || !parsed.sourceGroupId) {
        return null;
      }
      return { tabId: parsed.tabId, sourceGroupId: parsed.sourceGroupId };
    } catch {
      return null;
    }
  };

  const handleTabDragStart = useCallback((payload: { tabId: string; sourceGroupId: string }) => {
    if (
      payload.sourceGroupId !== 'left-top' &&
      payload.sourceGroupId !== 'left-bottom' &&
      payload.sourceGroupId !== 'right-top' &&
      payload.sourceGroupId !== 'right-bottom'
    ) {
      return;
    }
    setDraggingTab({
      tabId: payload.tabId,
      sourcePaneId: payload.sourceGroupId,
    });
  }, []);

  const handleTabDragEnd = useCallback(() => {
    setDraggingTab(null);
    setDropIndicator(null);
  }, []);

  const resolveDropPlacement = (
    sourcePaneId: EditorPaneId,
    targetPaneId: EditorPaneId,
    targetElement: HTMLElement,
    clientX: number,
    clientY: number
  ): PaneDropPlacement | null => {
    const rect = targetElement.getBoundingClientRect();
    const ratioX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const ratioY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;

    if (sourcePaneId !== targetPaneId) {
      if (ratioY <= 0.25) return 'top';
      if (ratioY >= 0.75) return 'bottom';
      return 'full';
    }

    const sourcePaneTabCount = getPaneTabs(sourcePaneId).length;
    if (sourcePaneTabCount <= 1) {
      return null;
    }

    if (ratioX <= 0.25) return 'left';
    if (ratioX >= 0.75) return 'right';
    if (ratioY <= 0.25) return 'top';
    if (ratioY >= 0.75) return 'bottom';
    return null;
  };

  const resolveCrossPaneDropTarget = useCallback((
    targetPaneId: EditorPaneId,
    placement: PaneDropPlacement
  ): EditorPaneId => {
    if (placement === 'top') {
      return targetPaneId.startsWith('left') ? 'left-top' : 'right-top';
    }
    if (placement === 'bottom') {
      return targetPaneId.startsWith('left') ? 'left-bottom' : 'right-bottom';
    }
    return targetPaneId;
  }, []);

  const resolvePaneDropTargetElement = useCallback((paneElement: HTMLElement): HTMLElement => {
    const directContentElement = Array.from(paneElement.children).find((child): child is HTMLElement => (
      child instanceof HTMLElement && child.classList.contains('editor-area-content')
    ));
    return directContentElement ?? paneElement;
  }, []);

  const handlePaneDragOver = (targetPaneId: EditorPaneId, event: React.DragEvent<HTMLElement>) => {
    const payload = readDraggedTabPayload(event) || (
      draggingTab
        ? { tabId: draggingTab.tabId, sourceGroupId: draggingTab.sourcePaneId }
        : null
    );
    if (!payload) {
      return;
    }

    const currentLocated = findPaneByTabId(payload.tabId);
    const sourcePaneId = currentLocated?.paneId ?? payload.sourceGroupId;
    const dropTargetElement = resolvePaneDropTargetElement(event.currentTarget as HTMLElement);
    const placement = resolveDropPlacement(
      sourcePaneId,
      targetPaneId,
      dropTargetElement,
      event.clientX,
      event.clientY
    );

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = placement ? 'move' : 'none';

    if (placement) {
      setDropIndicator({ paneId: targetPaneId, placement });
    } else {
      setDropIndicator(null);
    }
  };

  const handlePaneDragLeave = (targetPaneId: EditorPaneId, event: React.DragEvent<HTMLElement>) => {
    const current = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (related && current.contains(related)) {
      return;
    }
    if (dropIndicator?.paneId === targetPaneId) {
      setDropIndicator(null);
    }
  };

  const handlePaneDrop = (targetPaneId: EditorPaneId, event: React.DragEvent<HTMLElement>) => {
    const payload = readDraggedTabPayload(event) || (
      draggingTab
        ? { tabId: draggingTab.tabId, sourceGroupId: draggingTab.sourcePaneId }
        : null
    );
    if (!payload) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const currentLocated = findPaneByTabId(payload.tabId);
    const sourcePaneId = currentLocated?.paneId ?? payload.sourceGroupId;
    const dropTargetElement = resolvePaneDropTargetElement(event.currentTarget as HTMLElement);
    const placement = resolveDropPlacement(
      sourcePaneId,
      targetPaneId,
      dropTargetElement,
      event.clientX,
      event.clientY
    );
    setDropIndicator(null);
    setDraggingTab(null);

    if (!placement) {
      return;
    }

    const { tabId } = payload;
    if (sourcePaneId === targetPaneId) {
      if (placement === 'left' || placement === 'right') {
        handleSplitHorizontal(tabId);
        return;
      }
      if (placement === 'top' || placement === 'bottom') {
        handleSplitVertical(tabId);
      }
      return;
    }

    const crossPaneTarget = resolveCrossPaneDropTarget(targetPaneId, placement);
    moveTabToPane(tabId, crossPaneTarget);
  };

  const renderDropIndicator = (paneId: EditorPaneId) => {
    if (!dropIndicator || dropIndicator.paneId !== paneId) {
      return null;
    }
    return <div className={`editor-area-drop-indicator ${dropIndicator.placement}`} />;
  };

  return (
    <div className={`editor-area ${draggingTab ? 'is-tab-dragging' : ''} ${className}`}>
      {/* 缂栬緫鍣ㄧ粍瀹瑰櫒 - 鏀寔鍒嗗睆 */}
      <div className="editor-area-groups" ref={editorGroupsRef}>
        {/* 宸︿晶缂栬緫鍣ㄧ粍 */}
        <div 
          className={`editor-area-group ${isSplitView ? 'split-left' : 'full'}`}
          style={leftColumnStyle}
        >
          <div
            className="editor-area-subgroup"
            style={leftTopStyle}
            onDragOver={(event) => handlePaneDragOver('left-top', event)}
            onDragLeave={(event) => handlePaneDragLeave('left-top', event)}
            onDrop={(event) => handlePaneDrop('left-top', event)}
          >
          {/* 宸︿晶鏍囩鏍?- 濮嬬粓鏄剧ず锛屽嵆浣挎病鏈夋爣绛?*/}
          {tabs.length > 0 ? (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              editorType={editorType}
              onTabClick={handleTabClick}
              onTabClose={handleTabClose}
              dragGroupId="left-top"
              onTabDragStart={handleTabDragStart}
              onTabDragEnd={handleTabDragEnd}
              onSplitHorizontal={handleSplitHorizontal}
              onSplitVertical={handleSplitVertical}
              onSplitToDirection={splitTabToDirection}
              onMoveToDirection={moveTabByDirection}
              onAddTabToChat={addTabToChatContext}
              onOpenTabInExplorer={openTabInSystemExplorer}
              onRevealTabInExplorerView={revealTabInExplorerView}
              onCloseMultipleTabs={(tabIds) => closeMultipleTabsByPane('left-top', tabIds)}
              onOpenInNewWindow={handleOpenTabInNewWindow}
            />
          ) : (
            <div className="tab-bar-placeholder" />
          )}

          {/* 宸︿晶闈㈠寘灞?*/}
          {activeTab && activeTab.type !== 'settings' && activeTab.type !== 'markdown-preview' && activeTab.type !== 'knowledge' && activeTab.type !== 'ai-config' && activeTab.type !== 'lancedb-view' && activeTab.type !== 'decomposition-rules' && activeTab.type !== 'prompt-management' && activeTab.type !== 'ai-chat' && activeTab.type !== 'terminal' && (
            <Breadcrumb path={activeTab.path} />
          )}

          {/* 宸︿晶缂栬緫鍣ㄥ唴瀹?*/}
          <div className="editor-area-content">
            {renderDropIndicator('left-top')}
            {/* 绌虹姸鎬?*/}
            {!activeTab && (
              <div className="editor-area-empty">
                <div className="editor-area-empty-content">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="title">娌℃湁鎵撳紑鐨勭紪杈戝櫒</p>
                  <p className="subtitle">从文件浏览器打开文件开始编辑</p>
                </div>
              </div>
            )}

            {/* 娓叉煋鎵€鏈夋爣绛鹃〉锛岄€氳繃 display 鎺у埗鍙鎬э紝閬垮厤閲嶆柊鍔犺浇 */}
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              
              return (
                <div 
                  key={tab.id} 
                  className="editor-tab-content"
                  style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                >
                  {tab.type === 'settings' && <SettingsView />}
                  
                  {tab.type === 'extension-manager' && <ExtensionManagerView />}
                  
                  {tab.type === 'lancedb-view' && <LanceDBView />}

                  {tab.type === 'table-designer' && <TableDesigner formId={tab.formId} />}
                  
                  {tab.type === 'mermaid-designer' && (
                    <MermaidDesigner
                      initialCode={tab.mermaidData?.code}
                      title={tab.mermaidData?.title}
                    />
                  )}

                  {tab.type === 'skills-market' && <SkillsMarketView />}

                  {tab.type === 'decomposition-rules' && (
                    <DecompositionRulesView
                      initialRules={tab.decompositionRulesData?.rules}
                      initialWritingRuleDocuments={tab.decompositionRulesData?.writingRuleDocuments}
                    />
                  )}

                  {tab.type === 'prompt-management' && <PromptManagementView />}

                  {tab.type === 'media' && <MediaPanel />}

                  {tab.type === 'ai-chat' && (
                    <AIChatPanel
                      mode="editor-tab"
                      onClose={() => handleTabClose(tab.id)}
                      position="right"
                    />
                  )}

                  {tab.type === 'terminal' && tab.terminalData && (
                    <TerminalSessionView
                      session={tab.terminalData.session}
                      isActive={isActive}
                      isVisible={isActive}
                      isLiveResizing={false}
                    />
                  )}

                  {tab.type === 'ai-config' && (
                    <AIConfigView configId={tab.configId} configIndex={tab.configIndex} />
                  )}

                  {tab.type === 'markdown-preview' && (
                    <MarkdownPreview 
                      content={tab.content || ''} 
                      title={tab.title}
                      sourceTabId={tab.sourceTabId}
                    />
                  )}
                  
                  {tab.type === 'knowledge' && (
                    <KnowledgeBaseView
                      knowledgeId={tab.knowledgeData?.id || ''}
                      knowledgeTitle={tab.title}
                      knowledgeDescription={tab.knowledgeData?.description || ''}
                      items={tab.knowledgeData?.items || []}
                      onFileOpen={async (item) => {
                        // 鍦ㄧ紪杈戝櫒涓墦寮€鏂囦欢
                        if (item.type === 'file' && item.path) {
                          try {
                            // 璇诲彇鏂囦欢鍐呭
                            const result = await window.electron?.file?.read(item.path);
                            if (result?.success && result.data) {
                              window.dispatchEvent(new CustomEvent('open-file', {
                                detail: {
                                  path: item.path,
                                  name: item.title,
                                  content: result.data.content,
                                  language: item.metadata?.fileType === 'markdown' ? 'markdown' : 'plaintext',
                                  isPreview: false
                                }
                              }));
                            }
                          } catch (error) {
                            console.error('[EditorArea] 璇诲彇鏂囦欢澶辫触:', error);
                          }
                        }
                      }}
                      onFileDelete={(item) => {
                        // 瑙﹀彂鍒犻櫎浜嬩欢
                        window.dispatchEvent(new CustomEvent('delete-knowledge-item', {
                          detail: { itemId: item.id }
                        }));
                      }}
                    />
                  )}
                  
                  {tab.type === 'file' && editorType === 'monaco' && (
                    <EditorGroup
                      file={tab}
                      onContentChange={(content) => {
                        console.log('[EditorArea] Monaco content change, hasNewlines:', content.includes('\n'));
                        updateFileTabContent(tab.id, content);

                        // 濡傛灉鏄綋鍓嶆椿鍔ㄦ爣绛鹃〉锛岃Е鍙戝ぇ绾叉洿鏂颁簨浠?
                        if (tab.id === activeTabId) {
                          window.dispatchEvent(new CustomEvent('editor:content-changed', {
                            detail: {
                              content: content,
                              language: tab.language || 'plaintext',
                              path: tab.path
                            }
                          }));
                        }
                      }}
                      onCompositionStateChange={(isComposing, content) => {
                        handleFileTabCompositionStateChange(tab.id, isComposing, content);
                      }}
                    />
                  )}
                  
                  {tab.type === 'file' && editorType === 'codemirror' && (
                    <CodeMirrorEditor
                      content={(() => {
                        const rawContent = tab.content || '';
                        // CodeMirror 浣跨敤 Markdown 婧愮爜
                        const isHtml = isHtmlContent(rawContent);
                        return isHtml ? htmlToMarkdown(rawContent) : rawContent;
                      })()}
                      onChange={(markdownContent) => {
                        updateTabInAllPanes(tab.id, current => ({
                          ...current,
                          content: markdownContent,
                          isDirty: true,
                          isPreview: false
                        }));

                        // 濡傛灉鏄綋鍓嶆椿鍔ㄦ爣绛鹃〉锛岃Е鍙戝ぇ绾叉洿鏂颁簨浠?
                        if (tab.id === activeTabId) {
                          window.dispatchEvent(new CustomEvent('editor:content-changed', {
                            detail: {
                              content: markdownContent,
                              language: tab.language || 'plaintext',
                              path: tab.path
                            }
                          }));
                        }
                      }}
                      editable={true}
                      isActive={tab.id === activeTabId}
                    />
                  )}
                </div>
              );
            })}
          </div>
          </div>

          {leftVerticalSplit && (
            <>
              <ResizableDivider
                onResize={setLeftTopHeight}
                orientation="vertical"
                minPrimarySize={220}
                minSecondarySize={220}
              />

              <div
                className="editor-area-subgroup"
                onDragOver={(event) => handlePaneDragOver('left-bottom', event)}
                onDragLeave={(event) => handlePaneDragLeave('left-bottom', event)}
                onDrop={(event) => handlePaneDrop('left-bottom', event)}
              >
                {leftBottomTabs.length > 0 ? (
                  <TabBar
                    tabs={leftBottomTabs}
                    activeTabId={leftBottomActiveTabId}
                    editorType={editorType}
                    onTabClick={handleLeftBottomTabClick}
                    onTabClose={handleLeftBottomTabClose}
                    dragGroupId="left-bottom"
                    onTabDragStart={handleTabDragStart}
                    onTabDragEnd={handleTabDragEnd}
                    onSplitHorizontal={handleSplitHorizontal}
                    onSplitVertical={handleSplitVertical}
                    onSplitToDirection={splitTabToDirection}
                    onMoveToDirection={moveTabByDirection}
                    onAddTabToChat={addTabToChatContext}
                    onOpenTabInExplorer={openTabInSystemExplorer}
                    onRevealTabInExplorerView={revealTabInExplorerView}
                    onCloseMultipleTabs={(tabIds) => closeMultipleTabsByPane('left-bottom', tabIds)}
                    onOpenInNewWindow={handleOpenTabInNewWindow}
                  />
                ) : (
                  <div className="tab-bar-placeholder" />
                )}

                {leftBottomActiveTab && leftBottomActiveTab.type === 'file' && (
                  <Breadcrumb path={leftBottomActiveTab.path} />
                )}

                <div className="editor-area-content">
                  {renderDropIndicator('left-bottom')}
                  {!leftBottomActiveTab && (
                    <div className="editor-area-empty">
                      <div className="editor-area-empty-content">
                        <p className="title">没有打开的编辑器</p>
                      </div>
                    </div>
                  )}

                  {leftBottomTabs.map((tab) => {
                    const isActive = tab.id === leftBottomActiveTabId;
                    return (
                      <div
                        key={tab.id}
                        className="editor-tab-content"
                        style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                      >
                        {tab.type === 'terminal' && tab.terminalData && (
                          <TerminalSessionView
                            session={tab.terminalData.session}
                            isActive={isActive}
                            isVisible={isActive}
                            isLiveResizing={false}
                          />
                        )}

                        {tab.type === 'file' && editorType === 'monaco' && (
                          <EditorGroup
                            file={tab}
                            onContentChange={(content) => {
                              updateFileTabContent(tab.id, content);
                            }}
                            onCompositionStateChange={(isComposing, content) => {
                              handleFileTabCompositionStateChange(tab.id, isComposing, content);
                            }}
                          />
                        )}

                        {tab.type === 'file' && editorType === 'codemirror' && (
                          <CodeMirrorEditor
                            content={(() => {
                              const rawContent = tab.content || '';
                              const isHtml = isHtmlContent(rawContent);
                              return isHtml ? htmlToMarkdown(rawContent) : rawContent;
                            })()}
                            onChange={(markdownContent) => {
                              updateTabInAllPanes(tab.id, current => ({
                                ...current,
                                content: markdownContent,
                                isDirty: true,
                                isPreview: false
                              }));
                            }}
                            editable={true}
                            isActive={isActive}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 鍙皟鏁村ぇ灏忕殑鍒嗛殧鏉?*/}
        {isSplitView && (
          <ResizableDivider
            onResize={handleResizeMainSplit}
            orientation="horizontal"
            minPrimarySize={300}
            minSecondarySize={300}
          />
        )}

        {/* 鍙充晶缂栬緫鍣ㄧ粍 */}
        {isSplitView && extraRightSplitPanes.map((pane, index) => {
          const sourceLocated = findPaneByPath(pane.sourcePath, 'file');
          if (!sourceLocated || sourceLocated.tab.type !== 'file') {
            return null;
          }

          const sourceTab = sourceLocated.tab;
          const extraTab: EditorTab = {
            ...sourceTab,
            id: buildExtraSplitTabId(pane.id),
            splitSourceTabId: sourceTab.id,
            isPreview: false,
          };
          const previousColumnId = index === 0 ? null : extraRightSplitPanes[index - 1]?.id ?? null;

          return (
            <React.Fragment key={pane.id}>
              {previousColumnId && (
                <ResizableDivider
                  onResize={(leftSize, rightSize) => handleResizeRightPanePair(previousColumnId, pane.id, leftSize, rightSize)}
                  orientation="horizontal"
                  minPrimarySize={220}
                  minSecondarySize={220}
                  resizeScope="adjacent"
                />
              )}
              <div
                className="editor-area-group split-right extra-right-split-pane"
                style={getRightColumnStyle(pane.id)}
              >
                <div className="editor-area-subgroup">
                  <TabBar
                    tabs={[extraTab]}
                    activeTabId={extraTab.id}
                    editorType={editorType}
                    onTabClick={() => handleExtraRightPaneTabClick(sourceLocated.paneId, sourceTab.id)}
                    onTabClose={() => closeExtraRightSplitPane(pane.id)}
                    onSplitToDirection={(_, direction) => handleExtraRightPaneSplitToDirection(sourceTab.id, direction)}
                    onMoveToDirection={(_, direction) => handleExtraRightPaneMoveToDirection(sourceTab.id, direction)}
                    onAddTabToChat={() => addTabToChatContext(sourceTab.id)}
                    onOpenTabInExplorer={() => openTabInSystemExplorer(sourceTab.id)}
                    onRevealTabInExplorerView={() => revealTabInExplorerView(sourceTab.id)}
                    onCloseMultipleTabs={() => closeExtraRightSplitPane(pane.id)}
                    onOpenInNewWindow={() => handleOpenTabInNewWindow(sourceTab.id)}
                  />

                  <Breadcrumb path={sourceTab.path} />

                  <div className="editor-area-content">
                    {editorType === 'monaco' ? (
                      <EditorGroup
                        file={extraTab}
                        onContentChange={(content) => {
                          updateFileTabContent(sourceTab.id, content, { clearDiffPreview: true });
                        }}
                        onCompositionStateChange={(isComposing, content) => {
                          handleFileTabCompositionStateChange(sourceTab.id, isComposing, content, { clearDiffPreview: true });
                        }}
                      />
                    ) : (
                      <CodeMirrorEditor
                        content={(() => {
                          const rawContent = sourceTab.content || '';
                          const isHtml = isHtmlContent(rawContent);
                          return isHtml ? htmlToMarkdown(rawContent) : rawContent;
                        })()}
                        onChange={(markdownContent) => {
                          updateTabInAllPanes(sourceTab.id, current => ({
                            ...current,
                            content: markdownContent,
                            isDirty: true,
                            isPreview: false
                          }));
                        }}
                        editable={true}
                        isActive={true}
                      />
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {isSplitView && isMainRightPaneVisible && (
          <React.Fragment key="right-main-pane">
            {extraRightSplitPanes.length > 0 && (
              <ResizableDivider
                onResize={(leftSize, rightSize) => handleResizeRightPanePair(extraRightSplitPanes[extraRightSplitPanes.length - 1].id, 'right-main', leftSize, rightSize)}
                orientation="horizontal"
                minPrimarySize={220}
                minSecondarySize={220}
                resizeScope="adjacent"
              />
            )}
            <div 
              className="editor-area-group split-right"
              style={getRightColumnStyle('right-main')}
            >
            <div
              className="editor-area-subgroup"
              style={rightTopStyle}
              onDragOver={(event) => handlePaneDragOver('right-top', event)}
              onDragLeave={(event) => handlePaneDragLeave('right-top', event)}
              onDrop={(event) => handlePaneDrop('right-top', event)}
            >
            {/* 鍙充晶鏍囩鏍?*/}
            {rightTabs.length > 0 && (
              <TabBar
                tabs={rightTabs}
                activeTabId={rightActiveTabId}
                editorType={editorType}
                onTabClick={handleRightTabClick}
                onTabClose={handleRightTabClose}
                dragGroupId="right-top"
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={handleTabDragEnd}
                onSplitHorizontal={handleSplitHorizontal}
                onSplitVertical={handleSplitVertical}
                onSplitToDirection={splitTabToDirection}
                onMoveToDirection={moveTabByDirection}
                onAddTabToChat={addTabToChatContext}
                onOpenTabInExplorer={openTabInSystemExplorer}
                onRevealTabInExplorerView={revealTabInExplorerView}
                onCloseMultipleTabs={(tabIds) => closeMultipleTabsByPane('right-top', tabIds)}
                onOpenInNewWindow={handleOpenTabInNewWindow}
              />
            )}

            {/* 鍙充晶闈㈠寘灞?*/}
            {rightActiveTab && rightActiveTab.type !== 'settings' && rightActiveTab.type !== 'markdown-preview' && rightActiveTab.type !== 'knowledge' && rightActiveTab.type !== 'ai-config' && rightActiveTab.type !== 'lancedb-view' && rightActiveTab.type !== 'decomposition-rules' && rightActiveTab.type !== 'prompt-management' && rightActiveTab.type !== 'ai-chat' && rightActiveTab.type !== 'terminal' && (
              <Breadcrumb path={rightActiveTab.path} />
            )}

            {/* 鍙充晶缂栬緫鍣ㄥ唴瀹?*/}
            <div className="editor-area-content">
              {renderDropIndicator('right-top')}
              {/* 娓叉煋鎵€鏈夊彸渚ф爣绛鹃〉锛岄€氳繃 display 鎺у埗鍙鎬э紝閬垮厤閲嶆柊鍔犺浇 */}
              {rightTabs.map((tab) => {
                const isActive = tab.id === rightActiveTabId;
                
                return (
                  <div 
                    key={tab.id} 
                    className="editor-tab-content"
                    style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                  >
                    {tab.type === 'settings' && <SettingsView />}
                    
                    {tab.type === 'extension-manager' && <ExtensionManagerView />}
                    
                    {tab.type === 'lancedb-view' && <LanceDBView />}

                    {tab.type === 'table-designer' && <TableDesigner formId={tab.formId} />}
                    
                    {tab.type === 'mermaid-designer' && (
                      <MermaidDesigner
                        initialCode={tab.mermaidData?.code}
                        title={tab.mermaidData?.title}
                      />
                    )}

                    {tab.type === 'skills-market' && <SkillsMarketView />}

                    {tab.type === 'decomposition-rules' && (
                      <DecompositionRulesView
                        initialRules={tab.decompositionRulesData?.rules}
                        initialWritingRuleDocuments={tab.decompositionRulesData?.writingRuleDocuments}
                      />
                    )}

                    {tab.type === 'prompt-management' && <PromptManagementView />}

                    {tab.type === 'ai-chat' && (
                      <AIChatPanel
                        mode="editor-tab"
                        onClose={() => handleRightTabClose(tab.id)}
                        position="right"
                      />
                    )}

                    {tab.type === 'terminal' && tab.terminalData && (
                      <TerminalSessionView
                        session={tab.terminalData.session}
                        isActive={isActive}
                        isVisible={isActive}
                        isLiveResizing={false}
                      />
                    )}

                    {tab.type === 'ai-config' && (
                      <AIConfigView configId={tab.configId} configIndex={tab.configIndex} />
                    )}

                    {tab.type === 'markdown-preview' && (
                      <MarkdownPreview 
                        content={tab.content || ''} 
                        title={tab.title}
                        sourceTabId={tab.sourceTabId}
                      />
                    )}
                    
                    {tab.type === 'knowledge' && (
                      <KnowledgeBaseView
                        knowledgeId={tab.knowledgeData?.id || ''}
                        knowledgeTitle={tab.title}
                        items={tab.knowledgeData?.items || []}
                        onFileOpen={async (item) => {
                          if (item.type === 'file' && item.path) {
                            try {
                              const result = await window.electron?.file?.read(item.path);
                              if (result?.success && result.data) {
                                window.dispatchEvent(new CustomEvent('open-file', {
                                  detail: {
                                    path: item.path,
                                    name: item.title,
                                    content: result.data.content,
                                    language: item.metadata?.fileType === 'markdown' ? 'markdown' : 'plaintext',
                                    isPreview: false
                                  }
                                }));
                              }
                            } catch (error) {
                              console.error('[EditorArea] 璇诲彇鏂囦欢澶辫触:', error);
                            }
                          }
                        }}
                        onFileDelete={(item) => {
                          window.dispatchEvent(new CustomEvent('delete-knowledge-item', {
                            detail: { itemId: item.id }
                          }));
                        }}
                      />
                    )}
                    
                    {tab.type === 'file' && (
                      <EditorGroup
                        file={tab}
                        onContentChange={(content) => {
                          updateFileTabContent(tab.id, content, { clearDiffPreview: true });
                        }}
                        onCompositionStateChange={(isComposing, content) => {
                          handleFileTabCompositionStateChange(tab.id, isComposing, content, { clearDiffPreview: true });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            </div>

            {rightVerticalSplit && (
              <>
                <ResizableDivider
                  onResize={setRightTopHeight}
                  orientation="vertical"
                  minPrimarySize={220}
                  minSecondarySize={220}
                />

                <div
                  className="editor-area-subgroup"
                  onDragOver={(event) => handlePaneDragOver('right-bottom', event)}
                  onDragLeave={(event) => handlePaneDragLeave('right-bottom', event)}
                  onDrop={(event) => handlePaneDrop('right-bottom', event)}
                >
                  {rightBottomTabs.length > 0 ? (
                    <TabBar
                      tabs={rightBottomTabs}
                      activeTabId={rightBottomActiveTabId}
                      editorType={editorType}
                      onTabClick={handleRightBottomTabClick}
                      onTabClose={handleRightBottomTabClose}
                      dragGroupId="right-bottom"
                      onTabDragStart={handleTabDragStart}
                      onTabDragEnd={handleTabDragEnd}
                      onSplitHorizontal={handleSplitHorizontal}
                      onSplitVertical={handleSplitVertical}
                      onSplitToDirection={splitTabToDirection}
                      onMoveToDirection={moveTabByDirection}
                      onAddTabToChat={addTabToChatContext}
                      onOpenTabInExplorer={openTabInSystemExplorer}
                      onRevealTabInExplorerView={revealTabInExplorerView}
                      onCloseMultipleTabs={(tabIds) => closeMultipleTabsByPane('right-bottom', tabIds)}
                      onOpenInNewWindow={handleOpenTabInNewWindow}
                    />
                  ) : (
                    <div className="tab-bar-placeholder" />
                  )}

                  {rightBottomActiveTab && rightBottomActiveTab.type === 'file' && (
                    <Breadcrumb path={rightBottomActiveTab.path} />
                  )}

                  <div className="editor-area-content">
                    {renderDropIndicator('right-bottom')}
                    {!rightBottomActiveTab && (
                      <div className="editor-area-empty">
                        <div className="editor-area-empty-content">
                          <p className="title">没有打开的编辑器</p>
                        </div>
                      </div>
                    )}

                    {rightBottomTabs.map((tab) => {
                      const isActive = tab.id === rightBottomActiveTabId;
                      return (
                        <div
                          key={tab.id}
                          className="editor-tab-content"
                          style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                        >
                          {tab.type === 'terminal' && tab.terminalData && (
                            <TerminalSessionView
                              session={tab.terminalData.session}
                              isActive={isActive}
                              isVisible={isActive}
                              isLiveResizing={false}
                            />
                          )}

                          {tab.type === 'file' && editorType === 'monaco' && (
                            <EditorGroup
                              file={tab}
                              onContentChange={(content) => {
                                updateFileTabContent(tab.id, content, { clearDiffPreview: true });
                              }}
                              onCompositionStateChange={(isComposing, content) => {
                                handleFileTabCompositionStateChange(tab.id, isComposing, content, { clearDiffPreview: true });
                              }}
                            />
                          )}

                          {tab.type === 'file' && editorType === 'codemirror' && (
                            <CodeMirrorEditor
                              content={(() => {
                                const rawContent = tab.content || '';
                                const isHtml = isHtmlContent(rawContent);
                                return isHtml ? htmlToMarkdown(rawContent) : rawContent;
                              })()}
                              onChange={(markdownContent) => {
                                updateTabInAllPanes(tab.id, current => ({
                                  ...current,
                                  content: markdownContent,
                                  isDirty: true,
                                  isPreview: false,
                                  diffPreview: undefined,
                                }));
                              }}
                              editable={true}
                              isActive={isActive}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
};

