/**
 * 缂傛牞绶崳銊ュ隘閸╃喎顔愰崳?
 * 閸旂喕鍏橀敍姘鳖吀閻炲棛绱潏鎴濇珤閺嶅洨顒锋い鐐光偓浣规瀮娴犳湹绻氱€涙ê鎷拌箛顐ｅ祹闁?
 * 閹诲繗鍫敍姘絹娓氭稒鏋冩禒鍓佺椽鏉堟垯鈧椒绻氱€涙ǜ鈧線顣╃憴鍫㈢搼閺嶇绺鹃崝鐔诲厴
 */

// 妞よ泛鐪伴弮銉ョ箶 - 濡€虫健閸旂姾娴囬弮鍓佺彌閸楄櫕澧界悰?
console.log('========================================');
console.log('');
console.log('========================================');

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EditorSelection } from '@codemirror/state';
import {
  cursorCharLeft,
  cursorCharRight,
  cursorGroupLeft,
  cursorGroupRight,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  cursorLineDown,
  cursorLineUp,
  deleteLine,
  indentLess,
  indentMore,
  insertNewlineAndIndent,
  moveLineDown,
  moveLineUp,
  redo,
  undo,
} from '@codemirror/commands';
import * as jsonc from 'jsonc-parser';
import { TabBar } from '../TabBar';
import { Breadcrumb } from '../Breadcrumb';
import { SettingsView } from '../../../Settings/SettingsView';
import { MarkdownPreview } from '../../../Editor/MarkdownPreview';
import { KnowledgeBaseView } from '../KnowledgeBaseView';
import { AIConfigView } from '../../../AIConfig/AIConfigView';
import { ResizableDivider } from '../ResizableDivider';
import { LanceDBView } from '../LanceDBView';
import { TableDesigner } from '../TableDesigner';
import { CodeMirrorEditor } from '../../../NoteEditor/CodeMirrorEditor';
import { MermaidDesigner } from '../../../NoteEditor/Mermaid/MermaidDesigner';
import { SkillsMarketView } from '../SkillsMarketView';
import { DecompositionRulesView } from '../DecompositionRulesView';
import { PromptManagementView } from '../PromptManagementView';
import { ExtensionView } from '../ExtensionView';
import { PluginRuntimeView } from '../PluginRuntimeView/PluginRuntimeView';
import { AIChatPanel } from '../../AIChatPanel/AIChatPanel';
import { MediaPanel } from '../../Sidebar/MediaPanel';
import { TerminalSessionView } from '../../Panel/TerminalPanel/TerminalPanel';
import type { TerminalSession } from '../../Panel/TerminalPanel/TerminalSession';
import type { SettingsCategory } from '../../Sidebar/SettingsSidebar';
import { htmlToMarkdown, markdownToHtml, isHtmlContent } from '../../../NoteEditor/utils/formatConverter';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';
import { saveAndRemoveTableDataService } from '../../../../services/tableData';
import type { KnowledgeItem } from '../../Sidebar/KnowledgeBase/types';
import { toastService } from '../../../../services/ToastService';
import { useLinkStore } from '../../../../stores/linkStore';
import { useNoteStore } from '../../../../stores/noteStore';
import { getNoteByPath, isLinkableFile, upsertNoteByPath } from '../../../../utils/noteLinking';
import type { OpenNoteInEditorMode } from '../../../../utils/noteLinking';
import type { WorkspaceSearchMatchOptions } from '../../../../utils/workspaceSearchMatch';
import type {
  OpenNoteInNewWindowPayload,
  WorkspaceOpenCanvasLayoutItem,
} from '../../../../types/electron';
import {
  getActiveCodeMirrorEditorMeta,
  getActiveCodeMirrorEditorView,
} from '../../../../lib/editor/activeCodeMirrorEditor';
import type {
  PluginEditorPerformActionRequestPayload,
  PluginEditorPerformActionResponsePayload,
  ExtensionHostTextEditPayload,
  PluginEditorApplyTextEditsRequestPayload,
  PluginEditorApplyTextEditsResponsePayload,
  PluginEditorStateRequestPayload,
  PluginEditorStateResponsePayload,
} from '@note-studio/shared';
import { PLUGIN_EDITOR_BRIDGE_CHANNELS } from '@note-studio/shared';
import { translate } from '../../../../i18n';
import './EditorArea.scss';

export interface EditorTab {
  id: string;
  title: string;
  path: string;
  isDirty: boolean;
  language?: string;
  content?: string;
  isContentLoading?: boolean;
  type?: 'file' | 'settings' | 'markdown-preview' | 'knowledge' | 'ai-config' | 'lancedb-view' | 'table-designer' | 'mermaid-designer' | 'skills-market' | 'decomposition-rules' | 'prompt-management' | 'media' | 'ai-chat' | 'terminal' | 'extension' | 'plugin-view';
  isPreview?: boolean;  // 閺傛澘顤冮敍姘Ц閸氾缚璐熸０鍕潔濡€崇础閿涘牆宕熼崙缁樺ⅵ瀵偓閿?
  sourceTabId?: string;  // 閺傛澘顤冮敍姘额暕鐟欏牊鐖ｇ粵楣冦€夐崗瀹犱粓閻ㄥ嫭绨弬鍥︽閺嶅洨顒锋い绀桪
  splitSourceTabId?: string;  // 鍒嗗睆鏍囩鍏宠仈鐨勬簮鏂囦欢鏍囩椤?ID
  knowledgeData?: { id: string; items: KnowledgeItem[]; description?: string };  // 閻儴鐦戞惔鎾存殶閹诡噯绱欓悽銊ょ艾 knowledge 缁鐎烽敍?
  configId?: string;  // 閺傛澘顤冮敍娆癐闁板秶鐤咺D閿涘牏鏁ゆ禍?ai-config 缁鐎烽敍灞肩喘閸忓牅濞囬悽銊︻劃鐎涙顔岄敍?
  configIndex?: number;  // 瀹告彃绨惧鍐跨窗AI闁板秶鐤嗙槐銏犵穿閿涘牏鏁ゆ禍?ai-config 缁鐎烽敍灞肩箽閻ｆ瑧鏁ゆ禍搴℃倻閸氬骸鍚嬬€圭櫢绱?
  mermaidData?: { code: string; title: string };  // Mermaid 濞翠胶鈻奸崶鐐殶閹诡噯绱欓悽銊ょ艾 mermaid-designer 缁鐎烽敍?
  formId?: string;  // 鐞涖劌宕烮D閿涘牏鏁ゆ禍?table-designer 缁鐎烽敍?
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
  pluginViewData?: {
    leafId: string;
    viewType: string;
    icon: string | null;
    html: string;
    sourcePath?: string | null;
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

type EditorAreaTranslationValue = string | number | boolean;

const translateEditorAreaText = (
  key: string,
  defaultValue: string,
  values?: Record<string, EditorAreaTranslationValue>,
): string => String(translate(key, values ? { defaultValue, ...values } : { defaultValue }));

const TAB_DRAG_MIME = 'application/x-note-studio-tab';
const CANVAS_RUNTIME_FILE_EXTENSIONS = ['.canvas', '.canvs'] as const;
const EDITOR_PANE_IDS: readonly EditorPaneId[] = ['left-top', 'left-bottom', 'right-top', 'right-bottom'];
const EDITOR_BRIDGE_PANE_ORDER: EditorPaneId[] = ['left-top', 'right-top', 'left-bottom', 'right-bottom'];

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
  skipCreate?: boolean;
  skipDirty?: boolean;
  diffPreview?: EditorTab['diffPreview'];
}

interface UpdateActiveTabTitleDetail {
  title?: string;
}

interface OpenFileDetail {
  path?: string;
  content?: string;
  name?: string;
  language?: string;
  activateIfExists?: boolean;
  isPreview?: boolean;
  lineNumber?: number;
  column?: number;
  searchMatch?: WorkspaceSearchMatchOptions;
  openMode?: OpenNoteInEditorMode;
}

interface OpenTerminalTabDetail {
  id?: string;
  title?: string;
  path?: string;
  terminalSession: TerminalSession;
  accentColor?: string | null;
}

interface OpenPluginViewDetail {
  leafId: string;
  path: string;
  sourcePath: string | null;
  title: string;
  viewType: string;
  icon: string | null;
  html: string;
  active: boolean;
}

interface ClosePluginViewDetail {
  leafId: string;
}

interface OpenSettingsDetail {
  category?: SettingsCategory;
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

interface PendingPluginViewPaneTarget {
  paneId: EditorPaneId;
  active: boolean;
}

interface OpenWorkspacePluginViewOptions {
  readonly forceNewLeaf?: boolean;
}

interface FileSavedDetail {
  path: string;
  tabId: string;
}

const normalizeComparableFilePath = (value: string): string =>
  value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const isEditorPaneId = (value: string): value is EditorPaneId =>
  EDITOR_PANE_IDS.includes(value as EditorPaneId);

const isCanvasRuntimePath = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return CANVAS_RUNTIME_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
};

const getFileNameFromPath = (value: string): string => {
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || value;
};

const getLineStartOffsets = (content: string): number[] => {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      offsets.push(index + 1);
    }
  }
  return offsets;
};

const getOffsetFromLineColumn = (
  content: string,
  line: number,
  column: number,
): number => {
  const lineStartOffsets = getLineStartOffsets(content);
  const lineIndex = line - 1;
  if (lineIndex < 0 || lineIndex >= lineStartOffsets.length) {
    throw new Error(`Line out of range: ${line}`);
  }

  const lineStartOffset = lineStartOffsets[lineIndex];
  const nextLineOffset = lineIndex + 1 < lineStartOffsets.length
    ? lineStartOffsets[lineIndex + 1] - 1
    : content.length;
  const lineEndOffset = nextLineOffset > lineStartOffset && content[nextLineOffset - 1] === '\r'
    ? nextLineOffset - 1
    : nextLineOffset;
  const maxColumn = (lineEndOffset - lineStartOffset) + 1;

  if (column < 1 || column > maxColumn) {
    throw new Error(`Column out of range: ${column}`);
  }

  return lineStartOffset + column - 1;
};

const getLineColumnFromOffset = (
  content: string,
  offset: number,
): {
  readonly line: number;
  readonly column: number;
} => {
  const normalizedOffset = Math.min(Math.max(offset, 0), content.length);
  const lineStartOffsets = getLineStartOffsets(content);

  for (let lineIndex = lineStartOffsets.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const lineStartOffset = lineStartOffsets[lineIndex];

    if (normalizedOffset >= lineStartOffset) {
      return {
        line: lineIndex + 1,
        column: (normalizedOffset - lineStartOffset) + 1,
      };
    }
  }

  return {
    line: 1,
    column: 1,
  };
};

const executePluginEditorCommand = (
  command: string,
  view: import('@codemirror/view').EditorView,
): boolean => {
  const commandMap: Record<string, (targetView: import('@codemirror/view').EditorView) => boolean> = {
    goUp: cursorLineUp,
    goDown: cursorLineDown,
    goLeft: cursorCharLeft,
    goRight: cursorCharRight,
    goStart: cursorLineBoundaryBackward,
    goEnd: cursorLineBoundaryForward,
    goWordLeft: cursorGroupLeft,
    goWordRight: cursorGroupRight,
    indentMore,
    indentLess,
    newlineAndIndent: insertNewlineAndIndent,
    swapLineUp: moveLineUp,
    swapLineDown: moveLineDown,
    deleteLine,
    undo,
    redo,
  };

  const handler = commandMap[command];

  if (!handler) {
    return false;
  }

  return handler(view);
};

const applyTextEditsToContent = (
  content: string,
  edits: readonly ExtensionHostTextEditPayload[],
): string => {
  const mappedEdits = edits.map((edit) => {
    const startOffset = getOffsetFromLineColumn(
      content,
      edit.range.startLine,
      edit.range.startColumn,
    );
    const endOffset = getOffsetFromLineColumn(
      content,
      edit.range.endLine,
      edit.range.endColumn,
    );

    if (endOffset < startOffset) {
      throw new Error('Text edit range is invalid.');
    }

    return {
      startOffset,
      endOffset,
      text: edit.text,
    };
  });

  mappedEdits.sort((left, right) => {
    if (left.startOffset !== right.startOffset) {
      return right.startOffset - left.startOffset;
    }
    return right.endOffset - left.endOffset;
  });

  let nextContent = content;
  for (const edit of mappedEdits) {
    nextContent =
      `${nextContent.slice(0, edit.startOffset)}${edit.text}${nextContent.slice(edit.endOffset)}`;
  }

  return nextContent;
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

const isFileTabPendingContent = (tab: EditorTab): boolean =>
  tab.type === 'file' && tab.isContentLoading === true;

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

const dedupePluginViewTabs = (items: readonly EditorTab[]): EditorTab[] => {
  const seenPluginViewKeys = new Set<string>();
  let changed = false;
  const nextTabs: EditorTab[] = [];

  for (const item of items) {
    if (item.type !== 'plugin-view') {
      nextTabs.push(item);
      continue;
    }

    const pluginSourcePath = item.pluginViewData?.sourcePath ?? '';
    const pluginLeafId = item.pluginViewData?.leafId ?? '';
    const uniqueKey = pluginSourcePath.trim().length > 0
      ? `source::${normalizeComparableFilePath(pluginSourcePath)}`
      : `leaf::${item.id}::${item.path}::${pluginLeafId}`;

    if (seenPluginViewKeys.has(uniqueKey)) {
      changed = true;
      continue;
    }

    seenPluginViewKeys.add(uniqueKey);
    nextTabs.push(item);
  }

  return changed ? nextTabs : items as EditorTab[];
};

const scheduleSettingsNavigation = (category?: SettingsCategory): void => {
  if (!category) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent<OpenSettingsDetail>('settings:navigate', {
        detail: { category },
      }));
    });
  });
};

export const EditorArea: React.FC<EditorAreaProps> = ({ className = '' }) => {
  console.log('========================================');
  console.log('');
  console.log('========================================');
  const isEditorOnlyWindow = new URLSearchParams(window.location.search).get('windowMode') === 'editor-only';
  
  // 瀹革缚鏅剁紓鏍帆閸ｃ劎绮?
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  
  // 閸欏厖鏅剁紓鏍帆閸ｃ劎绮嶉敍鍫㈡暏娴滃骸鍨庨崜鑼额潒閸ユ拝绱?
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
  
  // 閸掑棗澹婄憴鍡楁禈閺勵垰鎯佸┑鈧ú?
  const [isSplitView, setIsSplitView] = useState(false);
  const [leftVerticalSplit, setLeftVerticalSplit] = useState(false);
  const [rightVerticalSplit, setRightVerticalSplit] = useState(false);
  
  // 瀹革缚鏅剁紓鏍帆閸ｃ劎绮嶇€硅棄瀹抽敍鍫濆剼缁辩媴绱?
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [leftTopHeight, setLeftTopHeight] = useState<number | null>(null);
  const [rightTopHeight, setRightTopHeight] = useState<number | null>(null);
  const [rightColumnWidths, setRightColumnWidths] = useState<Record<string, number>>({});
  const [hasCustomizedHorizontalSplit, setHasCustomizedHorizontalSplit] = useState(false);

  // 鐠虹喕閲滈崫顏冪昂闁板秶鐤嗛弽鍥╊劮妞ゅ灚婀侀張顏冪箽鐎涙娈戦弴瀛樻暭
  const [unsavedConfigTabs, setUnsavedConfigTabs] = useState<Set<string>>(new Set());

  const editorGroupsRef = useRef<HTMLDivElement | null>(null);
  const previousTabsLengthRef = useRef<number>(0);
  const previousActiveTabIdRef = useRef<string | null>(null);
  const tabChangeReasonOverrideRef = useRef<EditorTabsChangeReason | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const rightActiveTabIdRef = useRef<string | null>(null);
  const leftBottomActiveTabIdRef = useRef<string | null>(null);
  const rightBottomActiveTabIdRef = useRef<string | null>(null);
  const focusedPaneIdRef = useRef<EditorPaneId>('left-top');
  const persistedOpenCanvasFilesRef = useRef<string>('');
  const pendingPluginViewPaneBySourcePathRef = useRef<Map<string, PendingPluginViewPaneTarget[]>>(new Map());
  const pluginViewPaneByLeafIdRef = useRef<Map<string, EditorPaneId>>(new Map());
  const initialRestoreCompletedRef = useRef<boolean>(false);
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
    const normalizedTabs = dedupePluginViewTabs(tabs);

    if (normalizedTabs === tabs) {
      return;
    }

    setTabs(normalizedTabs);
  }, [tabs]);

  useEffect(() => {
    const normalizedTabs = dedupePluginViewTabs(rightTabs);

    if (normalizedTabs === rightTabs) {
      return;
    }

    setRightTabs(normalizedTabs);
  }, [rightTabs]);

  useEffect(() => {
    const normalizedTabs = dedupePluginViewTabs(leftBottomTabs);

    if (normalizedTabs === leftBottomTabs) {
      return;
    }

    setLeftBottomTabs(normalizedTabs);
  }, [leftBottomTabs]);

  useEffect(() => {
    const normalizedTabs = dedupePluginViewTabs(rightBottomTabs);

    if (normalizedTabs === rightBottomTabs) {
      return;
    }

    setRightBottomTabs(normalizedTabs);
  }, [rightBottomTabs]);

  useEffect(() => {
    focusedPaneIdRef.current = focusedPaneId;
  }, [focusedPaneId]);

  const queuePendingPluginViewPaneTarget = useCallback((
    sourcePath: string,
    target: PendingPluginViewPaneTarget,
  ): void => {
    const normalizedPath = normalizeComparableFilePath(sourcePath);
    const currentQueue = pendingPluginViewPaneBySourcePathRef.current.get(normalizedPath) ?? [];
    pendingPluginViewPaneBySourcePathRef.current.set(normalizedPath, [...currentQueue, target]);
  }, []);

  const takePendingPluginViewPaneTarget = useCallback((
    sourcePath: string | null | undefined,
  ): PendingPluginViewPaneTarget | null => {
    if (!sourcePath) {
      return null;
    }

    const normalizedPath = normalizeComparableFilePath(sourcePath);
    const currentQueue = pendingPluginViewPaneBySourcePathRef.current.get(normalizedPath) ?? [];
    const [nextTarget, ...remainingQueue] = currentQueue;

    if (remainingQueue.length > 0) {
      pendingPluginViewPaneBySourcePathRef.current.set(normalizedPath, remainingQueue);
    } else {
      pendingPluginViewPaneBySourcePathRef.current.delete(normalizedPath);
    }

    return nextTarget ?? null;
  }, []);

  useEffect(() => {
    if (!initialRestoreCompletedRef.current) {
      return;
    }

    const collectCanvasLayout = (
      paneId: EditorPaneId,
      paneTabs: readonly EditorTab[],
      paneActiveTabId: string | null,
    ): WorkspaceOpenCanvasLayoutItem[] => {
      return paneTabs.flatMap((tab) => {
        const sourcePath = tab.type === 'plugin-view'
          ? (tab.pluginViewData?.sourcePath ?? null)
          : null;

        if (!isCanvasRuntimePath(sourcePath)) {
          return [];
        }

        return [{
          path: sourcePath,
          paneId,
          active: tab.id === paneActiveTabId,
        }];
      });
    };

    const allCanvasLayoutItems = [
      ...collectCanvasLayout('left-top', tabs, activeTabId),
      ...collectCanvasLayout('left-bottom', leftBottomTabs, leftBottomActiveTabId),
      ...collectCanvasLayout('right-top', rightTabs, rightActiveTabId),
      ...collectCanvasLayout('right-bottom', rightBottomTabs, rightBottomActiveTabId),
    ];
    const seenCanvasLayoutKeys = new Set<string>();
    const deduplicatedCanvasLayoutItems = allCanvasLayoutItems.filter((item) => {
      const key = `${normalizeComparableFilePath(item.path)}::${item.paneId}`;
      if (seenCanvasLayoutKeys.has(key)) {
        return false;
      }

      seenCanvasLayoutKeys.add(key);
      return true;
    });
    const deduplicatedCanvasPaths = [...new Map(deduplicatedCanvasLayoutItems.map((item) => [
      normalizeComparableFilePath(item.path),
      item.path,
    ])).values()];
    const focusedTab = focusedPaneId === 'left-top'
      ? (tabs.find((tab) => tab.id === activeTabId) ?? null)
      : focusedPaneId === 'left-bottom'
        ? (leftBottomTabs.find((tab) => tab.id === leftBottomActiveTabId) ?? null)
        : focusedPaneId === 'right-top'
          ? (rightTabs.find((tab) => tab.id === rightActiveTabId) ?? null)
          : (rightBottomTabs.find((tab) => tab.id === rightBottomActiveTabId) ?? null);
    const focusedCanvasPath = focusedTab?.type === 'plugin-view'
      ? (focusedTab.pluginViewData?.sourcePath ?? null)
      : null;

    if (focusedCanvasPath && deduplicatedCanvasPaths.includes(focusedCanvasPath)) {
      const focusedCanvasKey = `${normalizeComparableFilePath(focusedCanvasPath)}::${focusedPaneId}`;
      const focusedLayoutItem = deduplicatedCanvasLayoutItems.find((item) => (
        `${normalizeComparableFilePath(item.path)}::${item.paneId}` === focusedCanvasKey
      ));

      if (focusedLayoutItem) {
        const reorderedItems = deduplicatedCanvasLayoutItems.filter((item) => (
          `${normalizeComparableFilePath(item.path)}::${item.paneId}` !== focusedCanvasKey
        ));
        reorderedItems.push({ ...focusedLayoutItem, active: true });
        deduplicatedCanvasLayoutItems.splice(
          0,
          deduplicatedCanvasLayoutItems.length,
          ...reorderedItems,
        );
        deduplicatedCanvasPaths.splice(
          0,
          deduplicatedCanvasPaths.length,
          ...new Map(deduplicatedCanvasLayoutItems.map((item) => [
            normalizeComparableFilePath(item.path),
            item.path,
          ])).values(),
        );
      }
    }

    const nextSnapshot = JSON.stringify(deduplicatedCanvasLayoutItems);

    if (persistedOpenCanvasFilesRef.current === nextSnapshot) {
      return;
    }

    persistedOpenCanvasFilesRef.current = nextSnapshot;
    void window.electron?.workspace?.setOpenCanvasFiles(deduplicatedCanvasPaths);
    void window.electron?.workspace?.setOpenCanvasLayout(deduplicatedCanvasLayoutItems);
  }, [
    activeTabId,
    focusedPaneId,
    leftBottomActiveTabId,
    leftBottomTabs,
    rightActiveTabId,
    rightBottomActiveTabId,
    rightBottomTabs,
    rightTabs,
    tabs,
  ]);

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
    // 浠呭湪瀛樺湪鍒嗗睆鐘舵€佹椂鎵嶅皾璇曡嚜鍔ㄦ敹鏁涳紝閬垮厤瀵规櫘閫氬崟鏍囩鍦烘櫙閫犳垚骞叉壈
    if (!isSplitView && !leftVerticalSplit && !rightVerticalSplit && extraRightSplitPanes.length === 0) {
      return;
    }

    if (pendingPluginViewPaneBySourcePathRef.current.size > 0) {
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

  const getPaneSnapshot = useCallback((paneId: EditorPaneId): {
    readonly tabs: EditorTab[];
    readonly activeTabId: string | null;
  } => {
    if (paneId === 'left-top') {
      return {
        tabs: tabsRef.current,
        activeTabId: activeTabIdRef.current,
      };
    }
    if (paneId === 'right-top') {
      return {
        tabs: rightTabsRef.current,
        activeTabId: rightActiveTabIdRef.current,
      };
    }
    if (paneId === 'left-bottom') {
      return {
        tabs: leftBottomTabsRef.current,
        activeTabId: leftBottomActiveTabIdRef.current,
      };
    }

    return {
      tabs: rightBottomTabsRef.current,
      activeTabId: rightBottomActiveTabIdRef.current,
    };
  }, []);

  const resolvePluginEditorTab = useCallback((documentUri?: string | null): EditorTab | null => {
    const normalizedDocumentUri = typeof documentUri === 'string' && documentUri.trim().length > 0
      ? normalizeComparableFilePath(documentUri)
      : null;

    if (normalizedDocumentUri) {
      const matchedTab = getAllPaneTabsSnapshot().find((tab) =>
        tab.type === 'file' && normalizeComparableFilePath(tab.path) === normalizedDocumentUri,
      );
      return matchedTab ?? null;
    }

    const orderedPaneIds: EditorPaneId[] = [];
    for (const paneId of [focusedPaneIdRef.current, ...EDITOR_BRIDGE_PANE_ORDER]) {
      if (!orderedPaneIds.includes(paneId)) {
        orderedPaneIds.push(paneId);
      }
    }

    for (const paneId of orderedPaneIds) {
      const snapshot = getPaneSnapshot(paneId);
      if (!snapshot.activeTabId) {
        continue;
      }

      const activeTab = snapshot.tabs.find((tab) =>
        tab.id === snapshot.activeTabId && tab.type === 'file',
      );
      if (activeTab) {
        return activeTab;
      }
    }

    return getAllPaneTabsSnapshot().find((tab) => tab.type === 'file') ?? null;
  }, [getAllPaneTabsSnapshot, getPaneSnapshot]);

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

  const findPaneByType = useCallback((type: EditorTab['type']): { paneId: EditorPaneId; tab: EditorTab } | null => {
    const paneOrder: Array<{ paneId: EditorPaneId; tabs: EditorTab[] }> = [
      { paneId: 'left-top', tabs },
      { paneId: 'left-bottom', tabs: leftBottomTabs },
      { paneId: 'right-top', tabs: rightTabs },
      { paneId: 'right-bottom', tabs: rightBottomTabs },
    ];

    for (const pane of paneOrder) {
      const found = pane.tabs.find(tab => (tab.type || 'file') === type);
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

    if (tab.type !== 'file' && tab.type !== 'plugin-view' && targetPaneId !== 'left-top') {
      toastService.info('');
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

    const movingPluginViewLeafId = tab.type === 'plugin-view'
      ? tab.pluginViewData?.leafId
      : null;
    if (movingPluginViewLeafId) {
      pluginViewPaneByLeafIdRef.current.set(movingPluginViewLeafId, targetPaneId);
    }

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

  // 婢跺嫮鎮婇幍鎾崇磻缂傛牞绶崳銊︾垼缁涢箖銆?
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

    const resolvedType: EditorTab['type'] =
      type === 'ai-chat' || type === 'extension' ? type : 'file';
    console.log('[EditorArea] 鎵撳紑缂栬緫鍣ㄦ爣绛鹃〉:', title, resolvedType);

    // 妫€鏌ユ槸鍚﹀凡缁忔墦寮€鐩稿悓璺緞鐨勬爣绛鹃〉锛堝洓涓垎鍖洪兘妫€鏌ワ級
    const existingTabResult = resolvedType === 'extension'
      ? findPaneByType('extension')
      : findPaneByPath(path, resolvedType);
    if (existingTabResult) {
      const { paneId, tab } = existingTabResult;
      const shouldUpdateAiChatTitle = resolvedType === 'ai-chat' && !!title && tab.title !== title;
      const shouldUpdateExtensionTitle = resolvedType === 'extension' && !!title && tab.title !== title;
      const shouldUpdateExtensionPath = resolvedType === 'extension' && tab.path !== path;
      const shouldUpdateFileTitle = resolvedType === 'file' && !!title && tab.title !== title;
      const shouldUpdateFileLanguage = resolvedType === 'file' && !!language && tab.language !== language;
      const shouldUpdateFileContent = resolvedType === 'file' && content !== undefined && tab.content !== content;

      if (
        shouldUpdateAiChatTitle
        || shouldUpdateExtensionTitle
        || shouldUpdateExtensionPath
        || shouldUpdateFileTitle
        || shouldUpdateFileLanguage
        || shouldUpdateFileContent
      ) {
        setPaneTabs(paneId, prev => prev.map(item =>
          item.id === tab.id
            ? {
                ...item,
                title: shouldUpdateAiChatTitle || shouldUpdateExtensionTitle || shouldUpdateFileTitle
                  ? title || item.title
                  : item.title,
                path: shouldUpdateExtensionPath ? path : item.path,
                language: shouldUpdateFileLanguage ? language : item.language,
                content: shouldUpdateFileContent ? content : item.content,
              }
            : item
        ));
      }
      setPaneActiveTabId(paneId, tab.id);
      setFocusedPaneId(paneId);
      return;
    }

    // 鍒涘缓鏂扮殑鏍囩椤?
    const newTab: EditorTab = {
      id: `${resolvedType || 'editor'}-${Date.now()}`,
      title: title || (resolvedType === 'ai-chat' ? '鏈€夋嫨妯″瀷' : resolvedType === 'extension' ? 'Extension' : ''),
      path,
      isDirty: false,
      language: resolvedType === 'file' ? (language || 'plaintext') : undefined,
      content: resolvedType === 'file' ? (content || '') : undefined,
      type: resolvedType
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setFocusedPaneId('left-top');
  }, [findPaneByPath, findPaneByType, setPaneTabs, setPaneActiveTabId]);

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
      title: title || '缁堢',
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

  const handleOpenPluginViewTab = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<OpenPluginViewDetail>;
    const detail = customEvent.detail;

    if (!detail?.leafId || !detail.path) {
      return;
    }

    const existingTabResult = findPaneByPath(detail.path, 'plugin-view');
    if (existingTabResult) {
      const { paneId, tab } = existingTabResult;
      pluginViewPaneByLeafIdRef.current.set(detail.leafId, paneId);
      setPaneTabs(paneId, prev => prev.map(item => (
        item.id === tab.id
          ? {
              ...item,
              title: detail.title,
              path: detail.path,
              pluginViewData: {
                leafId: detail.leafId,
                viewType: detail.viewType,
                icon: detail.icon,
                html: detail.html,
                sourcePath: detail.sourcePath,
              },
            }
            : item
      )));

      if (detail.active) {
        setPaneActiveTabId(paneId, tab.id);
        setFocusedPaneId(paneId);
      }

      if (detail.active) {
        if (detail.sourcePath) {
          window.dispatchEvent(new CustomEvent('editor-active-file-change', {
            detail: { path: detail.sourcePath }
          }));
        }
      }

      return;
    }

    const rememberedPaneId = pluginViewPaneByLeafIdRef.current.get(detail.leafId) ?? null;
    const pendingTarget = rememberedPaneId === null
      ? takePendingPluginViewPaneTarget(detail.sourcePath)
      : null;
    const targetPaneId = rememberedPaneId ?? pendingTarget?.paneId ?? (detail.active ? focusedPaneIdRef.current : 'left-top');
    const shouldActivateNewTab = pendingTarget
      ? (pendingTarget.active || getPaneTabs(targetPaneId).length === 0)
      : detail.active;
    const normalizedSourcePath = detail.sourcePath
      ? normalizeComparableFilePath(detail.sourcePath)
      : null;
    const existingSameSourceInTarget = normalizedSourcePath
      ? getPaneTabs(targetPaneId).find((tab) => (
        tab.type === 'plugin-view'
        && tab.pluginViewData?.sourcePath
        && normalizeComparableFilePath(tab.pluginViewData.sourcePath) === normalizedSourcePath
      )) ?? null
      : null;

    if (
      existingSameSourceInTarget
      && existingSameSourceInTarget.pluginViewData?.leafId !== detail.leafId
    ) {
      void window.electron?.ipcRenderer.invoke('plugin-runtime:request-close-view', {
        leafId: detail.leafId,
      });
      setPaneActiveTabId(targetPaneId, existingSameSourceInTarget.id);
      setFocusedPaneId(targetPaneId);
      return;
    }

    pluginViewPaneByLeafIdRef.current.set(detail.leafId, targetPaneId);

    const newTab: EditorTab = {
      id: `plugin-view-${detail.leafId}`,
      title: detail.title,
      path: detail.path,
      isDirty: false,
      type: 'plugin-view',
      pluginViewData: {
        leafId: detail.leafId,
        viewType: detail.viewType,
        icon: detail.icon,
        html: detail.html,
        sourcePath: detail.sourcePath,
      },
    };

    ensurePaneVisibleForDrop(targetPaneId);
    setPaneTabs(targetPaneId, prev => {
      const matchingIndices = prev
        .map((tab, index) => ({
          tab,
          index,
        }))
        .filter(({ tab }) => {
        if (tab.type !== 'plugin-view') {
          return false;
        }

        return tab.id === newTab.id
          || tab.path === detail.path
          || tab.pluginViewData?.leafId === detail.leafId;
        })
        .map(({ index }) => index);

      if (matchingIndices.length === 0) {
        return [...prev, newTab];
      }

      const primaryIndex = matchingIndices[0];

      return prev
        .map((tab, index) => ({ tab, index }))
        .filter(({ index }) => !matchingIndices.includes(index) || index === primaryIndex)
        .map(({ tab, index }) => {
          if (index !== primaryIndex) {
            return tab;
          }

          return {
            ...tab,
            id: newTab.id,
            title: detail.title,
            path: detail.path,
            pluginViewData: {
              leafId: detail.leafId,
              viewType: detail.viewType,
              icon: detail.icon,
              html: detail.html,
              sourcePath: detail.sourcePath,
            },
          };
        });
    });
    if (shouldActivateNewTab) {
      setPaneActiveTabId(targetPaneId, newTab.id);
      setFocusedPaneId(targetPaneId);
      if (detail.sourcePath) {
        window.dispatchEvent(new CustomEvent('editor-active-file-change', {
          detail: { path: detail.sourcePath }
        }));
      }
    }
  }, [
    ensurePaneVisibleForDrop,
    findPaneByPath,
    getPaneTabs,
    moveTabToPane,
    setPaneActiveTabId,
    setPaneTabs,
    takePendingPluginViewPaneTarget,
  ]);

  const handleClosePluginViewTab = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<ClosePluginViewDetail>;
    const leafId = customEvent.detail?.leafId;

    if (!leafId) {
      return;
    }

    pluginViewPaneByLeafIdRef.current.delete(leafId);

    const paneSnapshots: Array<{ paneId: EditorPaneId; tabs: readonly EditorTab[] }> = [
      { paneId: 'left-top', tabs: tabsRef.current },
      { paneId: 'left-bottom', tabs: leftBottomTabsRef.current },
      { paneId: 'right-top', tabs: rightTabsRef.current },
      { paneId: 'right-bottom', tabs: rightBottomTabsRef.current },
    ];
    const located = paneSnapshots
      .map((pane) => ({
        paneId: pane.paneId,
        tab: pane.tabs.find((tab) => tab.pluginViewData?.leafId === leafId) ?? null,
      }))
      .find((entry) => entry.tab !== null) ?? null;

    if (!located || located.tab === null) {
      return;
    }

    const targetTab = located.tab;
    removeTabFromPane(located.paneId, targetTab.id);
    const nextTabs = getPaneTabs(located.paneId).filter(tab => tab.id !== targetTab.id);
    pickNextActiveForPane(located.paneId, nextTabs);
  }, [getPaneTabs, pickNextActiveForPane, removeTabFromPane]);

  useEffect(() => {
    window.addEventListener('open-editor-tab', handleOpenEditorTab);
    window.addEventListener('open-terminal-tab', handleOpenTerminalTab as EventListener);
    window.addEventListener('open-plugin-view-tab', handleOpenPluginViewTab as EventListener);
    window.addEventListener('close-plugin-view-tab', handleClosePluginViewTab as EventListener);
    
    return () => {
      window.removeEventListener('open-editor-tab', handleOpenEditorTab);
      window.removeEventListener('open-terminal-tab', handleOpenTerminalTab as EventListener);
      window.removeEventListener('open-plugin-view-tab', handleOpenPluginViewTab as EventListener);
      window.removeEventListener('close-plugin-view-tab', handleClosePluginViewTab as EventListener);
    };
  }, [handleClosePluginViewTab, handleOpenEditorTab, handleOpenPluginViewTab, handleOpenTerminalTab]);

  useEffect(() => () => {
    getAllPaneTabsSnapshot().forEach((tab) => {
      disposeTabResources(tab);
    });
  }, [disposeTabResources, getAllPaneTabsSnapshot]);

  // 閻╂垵鎯夐幓鎺戝弳閺佺増宓佹惔鎾广€冮弽闂寸皑娴犺绱濈捄瀹犳祮閸掔増鏋冩禒鍓佺椽鏉堟垵娅掗弽鍥╊劮妞?
  useEffect(() => {
    const handleInsertDatabaseTable = (event: Event) => {
      const customEvent = event as CustomEvent<{ focusEditor?: boolean }>;
      if (customEvent.detail?.focusEditor) {
        // 閹垫儳鍩岀粭顑跨娑擃亝鏋冩禒鍓佽閸ㄥ娈戦弽鍥╊劮妞ょ绱欓棃鐐额啎鐠佲€虫珤閿?
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

  // 閸旂姾娴囨稉濠冾偧閹垫挸绱戦惃鍕瀮濡?
  useEffect(() => {
    const loadLastOpened = async () => {
      try {
        const startupMode = new URLSearchParams(window.location.search).get('startupMode');
        if (startupMode === 'open-note-window') {
          initialRestoreCompletedRef.current = true;
          return;
        }

        const tryOpenPluginView = async (
          filePath: string,
          options?: OpenWorkspacePluginViewOptions,
        ): Promise<boolean> => {
          return await window.electron?.ipcRenderer.invoke(
            'plugin-runtime:request-open-workspace-file',
            filePath,
            options,
          ) === true;
        };

        const openCanvasLayoutResult = await window.electron?.workspace?.getOpenCanvasLayout?.();
        const openCanvasLayoutItems = openCanvasLayoutResult?.success
          ? (openCanvasLayoutResult.data ?? []).filter((item): item is WorkspaceOpenCanvasLayoutItem => (
            isCanvasRuntimePath(item.path) && isEditorPaneId(item.paneId)
          ))
          : [];

        if (openCanvasLayoutItems.length > 0) {
          let openedCanvasCount = 0;
          const openedCanvasPathKeys = new Set<string>();
          const orderedLayoutItems = [...openCanvasLayoutItems].sort((left, right) => (
            Number(left.active) - Number(right.active)
          ));

          for (const layoutItem of orderedLayoutItems) {
            const normalizedPath = normalizeComparableFilePath(layoutItem.path);
            const forceNewLeaf = openedCanvasPathKeys.has(normalizedPath);
            openedCanvasPathKeys.add(normalizedPath);
            queuePendingPluginViewPaneTarget(layoutItem.path, {
              paneId: layoutItem.paneId,
              active: layoutItem.active,
            });

            if (await tryOpenPluginView(layoutItem.path, { forceNewLeaf })) {
              openedCanvasCount += 1;
              continue;
            }

            await new Promise((resolve) => {
              window.setTimeout(resolve, 180);
            });

            if (await tryOpenPluginView(layoutItem.path, { forceNewLeaf })) {
              openedCanvasCount += 1;
              continue;
            }

            const pendingQueue = pendingPluginViewPaneBySourcePathRef.current.get(normalizedPath) ?? [];
            if (pendingQueue.length <= 1) {
              pendingPluginViewPaneBySourcePathRef.current.delete(normalizedPath);
            } else {
              pendingPluginViewPaneBySourcePathRef.current.set(normalizedPath, pendingQueue.slice(1));
            }
          }

          if (openedCanvasCount > 0) {
            initialRestoreCompletedRef.current = true;
            return;
          }
        }

        const openCanvasFilesResult = await window.electron?.workspace?.getOpenCanvasFiles();
        const openCanvasFiles = openCanvasFilesResult?.success
          ? (openCanvasFilesResult.data ?? []).filter((filePath): filePath is string => isCanvasRuntimePath(filePath))
          : [];

        if (openCanvasFiles.length > 0) {
          let openedCanvasCount = 0;

          for (const canvasFilePath of openCanvasFiles) {
            if (await tryOpenPluginView(canvasFilePath)) {
              openedCanvasCount += 1;
              continue;
            }

            await new Promise((resolve) => {
              window.setTimeout(resolve, 180);
            });

            if (await tryOpenPluginView(canvasFilePath)) {
              openedCanvasCount += 1;
            }
          }

          if (openedCanvasCount > 0) {
            initialRestoreCompletedRef.current = true;
            return;
          }
        }

        const result = await window.electron?.workspace?.getLastOpened();
        const lastOpenedPath = resolveLastOpenedPath(result as LastOpenedRestoreResult | undefined);
        if (!lastOpenedPath) {
          initialRestoreCompletedRef.current = true;
          return;
        }

        if (isCanvasRuntimePath(lastOpenedPath)) {
          if (await tryOpenPluginView(lastOpenedPath)) {
            initialRestoreCompletedRef.current = true;
            return;
          }

          await new Promise((resolve) => {
            window.setTimeout(resolve, 180);
          });

          if (await tryOpenPluginView(lastOpenedPath)) {
            initialRestoreCompletedRef.current = true;
            return;
          }
        }

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
        initialRestoreCompletedRef.current = true;
      } catch (error) {
        // 閸旂姾娴囨稉濠冾偧閹垫挸绱戦惃鍕瀮娴犺泛銇戠拹銉礉闂堟瑩绮径鍕倞
        initialRestoreCompletedRef.current = true;
      }
    };

    loadLastOpened();
  }, [queuePendingPluginViewPaneTarget]);

  // 閻╂垵鎯夐幍鎾崇磻閺傚洣娆㈡禍瀣╂
  useEffect(() => {
    console.log('[EditorArea] ========== useEffect 瀵偓婵鏁為崘灞肩皑娴犲墎娲冮崥顒€娅?==========');
    console.log('[EditorArea] 瑜版挸澧?tabs 閺佷即鍣?', tabs.length);
    
    const handleOpenFile = async (event: Event) => {
      tabChangeReasonOverrideRef.current = 'open';
      console.log('[EditorArea] ========== 閺€璺哄煂 open-file 娴滃娆?==========');
      console.log('[EditorArea] 娴滃娆㈢猾璇茬€?', event.type);
      console.log('[EditorArea] 娴滃娆㈢€电钖?', event);
      
      const customEvent = event as CustomEvent<OpenFileDetail>;
      
      console.log('[EditorArea] 娴滃娆㈢拠锔藉剰:', customEvent.detail);
      console.log('[EditorArea] 鐠囷附鍎忕猾璇茬€?', typeof customEvent.detail);
      
      if (customEvent.detail) {
        // 娴ｈ法鏁ら懛顏勭暰娑斿绨ㄦ禒鏈佃厬閻ㄥ嫭鏋冩禒鑸垫殶閹?
        const {
          path,
          content,
          name,
          language,
          activateIfExists = true,
          isPreview = false,
          lineNumber,
          column,
          searchMatch,
          openMode = 'default',
        } = customEvent.detail;
        
        console.log('[EditorArea] Opening file:', {
          path,
          name,
          language,
          contentLength: content?.length || 0,
          contentPreview: content?.substring(0, 100),
          isPreview,
          openMode,
        });

        const revealOpenedLine = (): void => {
          if (!lineNumber) {
            return;
          }

          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('note:reveal-line', {
              detail: {
                lineNumber,
                column: column || 1,
                searchMatch,
              }
            }));
          }, 100);
        };

        const createFileTab = (): EditorTab => ({
          id: `file-${Date.now()}`,
          title: name || 'Untitled',
          path: path || '',
          isDirty: false,
          language: language || 'plaintext',
          content: content ?? '',
          isContentLoading: content === undefined,
          type: 'file',
          isPreview,
        });

        const openFileInPane = (
          paneId: EditorPaneId,
          allowDuplicatePath: boolean,
        ): void => {
          ensurePaneVisibleForDrop(paneId);

          if (!allowDuplicatePath) {
            const existingTargetTab = getPaneTabs(paneId).find((tab) => (
              tab.type === 'file' && tab.path === path
            ));
            if (existingTargetTab) {
              if (content !== undefined) {
                setPaneTabs(paneId, (currentTabs) => currentTabs.map((tab) => (
                  tab.id === existingTargetTab.id
                    ? {
                        ...tab,
                        content,
                        language: language || tab.language,
                        isContentLoading: false,
                        isPreview: false,
                      }
                    : tab
                )));
              }

              setPaneActiveTabId(paneId, existingTargetTab.id);
              setFocusedPaneId(paneId);
              return;
            }
          }

          const newTab = createFileTab();
          setPaneTabs(paneId, (currentTabs) => [...currentTabs, newTab]);
          setPaneActiveTabId(paneId, newTab.id);
          setFocusedPaneId(paneId);
        };

        if (openMode === 'new-window') {
          const normalizedPath = path?.trim() || '';
          if (!normalizedPath) {
            toastService.error('当前文件缺少路径，无法在新窗口打开');
            return;
          }

          const openPayload: OpenNoteInNewWindowPayload = {
            path: normalizedPath,
            content: content ?? '',
            name: name || 'Untitled',
            language: language || 'plaintext',
            lineNumber,
            column: column || 1,
          };
          const openResult = window.electron?.openNoteInNewWindow
            ? await window.electron.openNoteInNewWindow(openPayload)
            : await window.electron?.ipcRenderer.invoke('window:open-note-in-new-window', openPayload);
          if (!openResult?.success) {
            toastService.error(openResult?.error || '在新窗口打开失败');
          }
          return;
        }

        if (openMode === 'new-tab') {
          openFileInPane(focusedPaneIdRef.current, true);
          revealOpenedLine();
          return;
        }

        if (openMode === 'split-right') {
          const targetPaneId: EditorPaneId = (
            focusedPaneIdRef.current === 'left-bottom'
            || focusedPaneIdRef.current === 'right-bottom'
          )
            ? 'right-bottom'
            : 'right-top';
          openFileInPane(targetPaneId, false);
          revealOpenedLine();
          return;
        }

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
          if (activateIfExists) {
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
          }
          if (!isPreview && existingTab.isPreview) {
            existingPane.setTabs(prev => prev.map(tab =>
              tab.id === existingTab.id
                ? {
                    ...tab,
                    isPreview: false,
                    content: content !== undefined ? content : tab.content,
                    language: language || tab.language,
                    isContentLoading: content === undefined ? tab.isContentLoading : false,
                  }
                : tab
            ));
          } else if (content !== undefined) {
            existingPane.setTabs(prev => prev.map(tab =>
              tab.id === existingTab.id
                ? { ...tab, content, language: language || tab.language, isContentLoading: false }
                : tab
            ));
          }
          revealOpenedLine();
          return;
        }
        
        // 娴ｈ法鏁ら崙鑺ユ殶瀵繑娲块弬鐗堟降鐠佸潡妫堕張鈧弬鎵畱 tabs 閻樿埖鈧緤绱濋柆鍨帳闂傤厼瀵橀梻顕€顣?
        setTabs(currentTabs => {
          // 濡偓閺屻儲妲搁崥锕€鍑＄紒蹇斿ⅵ瀵偓娴滃棜顕氶弬鍥︽
          const existingTab = currentTabs.find(tab => tab.path === path);
          
          if (existingTab) {
            // 鐠佸墽鐤嗘稉鐑樻た閸斻劍鐖ｇ粵?
            if (activateIfExists) {
              setTimeout(() => setActiveTabId(existingTab.id), 0);
            }
            
            // 婵″倹鐏夐弰顖氬蓟閸戠粯澧﹀鈧敍鍫ユ姜妫板嫯顫嶉敍澶涚礉鐏忓棝顣╃憴鍫熺垼缁涙崘娴嗘稉鍝勬祼鐎规碍鐖ｇ粵?
            // 閸氬本妞傞弴瀛樻煀閺嶅洨顒烽惃鍕敶鐎圭櫢绱欐俊鍌涚亯閹绘劒绶垫禍鍡礆
            if (!isPreview && existingTab.isPreview) {
              return currentTabs.map(tab => 
                tab.id === existingTab.id 
                  ? { 
                      ...tab, 
                      isPreview: false,
                      content: content !== undefined ? content : tab.content,
                      language: language || tab.language,
                      isContentLoading: content === undefined ? tab.isContentLoading : false,
                    } 
                  : tab
              );
            } else if (content !== undefined) {
              // 閺囧瓨鏌婇崘鍛啇閿涘牆顩ч弸婊勫絹娓氭稐绨￠弬鏉垮敶鐎圭櫢绱?
              return currentTabs.map(tab => 
                tab.id === existingTab.id 
                  ? { 
                      ...tab, 
                      content: content,
                      language: language || tab.language,
                      isContentLoading: false,
                    } 
                  : tab
              );
            }
            // 濞屸剝婀侀崣妯哄閿涘矁绻戦崶鐐插斧閺佹壆绮?
            return currentTabs;
          }
          
          // 婵″倹鐏夐弰顖烆暕鐟欏牊膩瀵骏绱濋弴鎸庡床閻滅増婀侀惃鍕暕鐟欏牊鐖ｇ粵?
          if (isPreview) {
            const previewTab = currentTabs.find(tab => tab.isPreview);
            if (previewTab) {
              // 閺囨寧宕叉０鍕潔閺嶅洨顒?
              const newId = `file-${Date.now()}`;
              setTimeout(() => setActiveTabId(newId), 0);
              return currentTabs.map(tab => 
                tab.isPreview ? {
                  id: newId,
                  title: name || 'Untitled',
                  path: path || '',
                  isDirty: false,
                  language: language || 'plaintext',
                  content: content ?? '',
                  isContentLoading: content === undefined,
                  type: 'file' as const,
                  isPreview: true
                } : tab
              );
            }
          }
          
          // 閸掓稑缂撻弬鐗堢垼缁?
          const newTab: EditorTab = {
            id: `file-${Date.now()}`,
            title: name || 'Untitled',
            path: path || '',
            isDirty: false,
            language: language || 'plaintext',
            content: content ?? '',
            isContentLoading: content === undefined,
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
        
        // 闂団偓鐟曚礁婀悩鑸碘偓浣规纯閺傛澘鎮楅懢宄板絿 existingTab.id 閹?newTab.id 閺夈儴顔曠純顔芥た閸斻劍鐖ｇ粵?
        // 閻㈠彉绨幋鎴滄粦閸︺劌鍤遍弫鏉跨础閺囧瓨鏌婃稉顓熸￥濞夋洜娲块幒銉問闂傤噯绱濋幋鎴滄粦娴ｈ法鏁?setTimeout 閸︺劋绗傞棃銏㈡畱娴狅絿鐖滄稉顓☆啎缂?
        
        // 婵″倹鐏夐幐鍥х暰娴滃棜顢戦崣鍑ょ礉鐟欙箑褰傜€规矮缍呮禍瀣╂
        revealOpenedLine();
      } else {
        // 閹垫挸绱戦弬鍥︽鐎电鐦藉鍡礄闂堢偤顣╃憴鍫熌佸蹇ョ礆
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
            
            // 娴ｈ法鏁ら崙鑺ユ殶瀵繑娲块弬?
            setTabs(currentTabs => {
              // 濡偓閺屻儲妲搁崥锕€鍑＄紒蹇斿ⅵ瀵偓娴滃棜顕氶弬鍥︽
              const existingTab = currentTabs.find(tab => tab.path === path);
              
              if (existingTab) {
                // 閸ュ搫鐣炬０鍕潔閺嶅洨顒?
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
          // 閹垫挸绱戦弬鍥︽婢惰精瑙﹂敍宀勬饯姒涙ê顦╅悶?
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
      const skipCreate = detail.skipCreate === true;
      const skipDirty = detail.skipDirty === true;
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
          if (skipDirty && tab.isDirty) return tab;

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

      if (targetPath && !skipCreate) {
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

    const handleOpenSettings = (event?: Event) => {
      const customEvent = event as CustomEvent<OpenSettingsDetail> | undefined;
      const category = customEvent?.detail?.category;

      // 娴ｈ法鏁ら崙鑺ユ殶瀵繑娲块弬鐗堟降鐠佸潡妫堕張鈧弬鎵畱 tabs 閻樿埖鈧?
      setTabs(currentTabs => {
        // 濡偓閺屻儲妲搁崥锕€鍑＄紒蹇旀箒鐠佸墽鐤嗛弽鍥╊劮妞?
        const settingsTab = currentTabs.find(tab => tab.type === 'settings');
        
        if (settingsTab) {
          // 婵″倹鐏夊鎻掔摠閸︻煉绱濋惄瀛樺复濠碘偓濞?
          setTimeout(() => {
            setActiveTabId(settingsTab.id);
            scheduleSettingsNavigation(category);
          }, 0);
          return currentTabs;
        } else {
          // 閸氾箑鍨崚娑樼紦閺傛壆娈戠拋鍓х枂閺嶅洨顒锋い?
          const newTab: EditorTab = {
            id: `settings-${Date.now()}`,
            title: '',
            path: 'settings:/',
            isDirty: false,
            type: 'settings'
          };
          setTimeout(() => {
            setActiveTabId(newTab.id);
            scheduleSettingsNavigation(category);
          }, 0);
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
            title: translateEditorAreaText('sidebar.titles.media', '素材管理'),
            path: 'media:/',
            isDirty: false,
            type: 'media'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenSettingsJson = (event: Event) => {
      const customEvent = event as CustomEvent<{ content: string }>;
      const jsonContent = customEvent.detail?.content || '{}';
      
      // 濡偓閺屻儲妲搁崥锕€鍑＄紒蹇旀箒 settings.json 閺嶅洨顒锋い?
      const settingsJsonTab = tabs.find(tab => tab.path === 'settings:/settings.json');
      
      if (settingsJsonTab) {
        // 婵″倹鐏夊鎻掔摠閸︻煉绱濋弴瀛樻煀閸愬懎顔愰獮鑸电负濞?
        setTabs(prev => prev.map(tab => 
          tab.path === 'settings:/settings.json' 
            ? { ...tab, content: jsonContent }
            : tab
        ));
        setActiveTabId(settingsJsonTab.id);
      } else {
        // 閸氾箑鍨崚娑樼紦閺傛壆娈?settings.json 閺嶅洨顒锋い?
        const newTab: EditorTab = {
          id: `settings-json-${Date.now()}`,
          title: 'settings.json',
          path: 'settings:/settings.json',
          isDirty: false,
          language: 'jsonc',  // 娴ｈ法鏁?jsonc 閺€顖涘瘮濞夈劑鍣?
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
      
      // 閸︺劌褰告笟褏绱潏鎴濇珤缂佸嫬鍨卞娲暕鐟欏牊鐖ｇ粵楣冦€?
      const previewTab: EditorTab = {
        id: `preview-${sourceTabId}`,
        title: `妫板嫯顫?- ${title}`,
        path: `preview:/${sourceTabId}`,
        isDirty: false,
        language: 'markdown',
        content: content,
        type: 'markdown-preview',
        sourceTabId: sourceTabId
      };
      
      // 濡偓閺屻儱褰告笟褎妲搁崥锕€鍑￠張澶庮嚉妫板嫯顫嶉弽鍥╊劮
      const existingPreview = rightTabs.find(tab => tab.sourceTabId === sourceTabId);
      
      if (existingPreview) {
        // 閺囧瓨鏌婇崘鍛啇
        setRightTabs(prev => prev.map(tab => 
          tab.id === existingPreview.id ? { ...tab, content } : tab
        ));
        setRightActiveTabId(existingPreview.id);
      } else {
        // 閸掓稑缂撻弬浼搭暕鐟欏牊鐖ｇ粵?
        setRightTabs(prev => [...prev, previewTab]);
        setRightActiveTabId(previewTab.id);
      }
      
      // 濠碘偓濞茶鍨庨崜鑼额潒閸?
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
            title: '',
            path: 'lancedb-view:/',
            isDirty: false,
            type: 'lancedb-view'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    // 閹垫挸绱戠悰銊︾壐鐠佹崘顓搁崳?
    const handleOpenTableDesigner = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId?: string; formName?: string; newTab?: boolean }>;
      const { formId, formName, newTab } = customEvent.detail || {};
      
      setTabs(currentTabs => {
        // 婵″倹鐏夐張?formId閿涘本顥呴弻銉︽Ц閸氾箑鍑＄紒蹇斿ⅵ瀵偓
        if (formId && !newTab) {
          const existingTab = currentTabs.find(tab => tab.formId === formId);
          if (existingTab) {
            setTimeout(() => setActiveTabId(existingTab.id), 0);
            return currentTabs;
          }
        }
        
        const tabId = `table-designer-${formId || Date.now()}`;
        const tabTitle = formName
          ? translateEditorAreaText('tableDesigner.tabs.named', '表格 - {{name}}', { name: formName })
          : translateEditorAreaText('tableDesigner.tabs.untitled', '表格设计器');
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

    // 閹垫挸绱?Mermaid 濞翠胶鈻奸崶鎹愵啎鐠佲€虫珤
    const handleOpenMermaidDesigner = (event: Event) => {
      const customEvent = event as CustomEvent<{ code: string; title: string }>;
      const { code, title } = customEvent.detail;

      setTabs(currentTabs => {
        const newTab: EditorTab = {
          id: `mermaid-designer-${Date.now()}`,
          title: title || '濞翠胶鈻奸崶鎹愵啎鐠佲€虫珤',
          path: `mermaid-designer:/${Date.now()}`,
          isDirty: false,
          type: 'mermaid-designer',
          mermaidData: { code, title }
        };
        setTimeout(() => setActiveTabId(newTab.id), 0);
        return [...currentTabs, newTab];
      });
    };

    // 閹垫挸绱?Skills 鐢倸婧€
    const handleOpenSkillsMarket = () => {
      setTabs(currentTabs => {
        const existingTab = currentTabs.find(tab => tab.type === 'skills-market');

        if (existingTab) {
          setTimeout(() => setActiveTabId(existingTab.id), 0);
          return currentTabs;
        } else {
          const newTab: EditorTab = {
            id: `skills-market-${Date.now()}`,
            title: 'Skills 鐢倸婧€',
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
          title: '閹峰棜袙鐟欏嫬鍨粻锛勬倞',
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
          title: '',
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
    const handleOpenNoteInNewWindow = (payload: OpenNoteInNewWindowPayload): void => {
      window.dispatchEvent(new CustomEvent<OpenFileDetail>('open-file', {
        detail: {
          path: payload.path,
          content: payload.content,
          name: payload.name,
          language: payload.language,
          activateIfExists: true,
          isPreview: false,
          lineNumber: payload.lineNumber,
          column: payload.column,
          openMode: 'default',
        }
      }));
    };
    const removeOpenNoteInNewWindowListener = window.electron?.onOpenNoteInNewWindow
      ? window.electron.onOpenNoteInNewWindow(handleOpenNoteInNewWindow)
      : window.electron?.ipcRenderer.on?.('window:open-note-in-new-window', (_event, payload) => {
          handleOpenNoteInNewWindow(payload as OpenNoteInNewWindowPayload);
        });
    if (window.electron?.notifyEditorReady) {
      window.electron.notifyEditorReady();
    } else {
      window.electron?.ipcRenderer.send('window:editor-ready');
    }
    
    console.log('[EditorArea] ========== 閹碘偓閺堝绨ㄦ禒鍓佹磧閸氼剙娅掑鍙夋暈閸?==========');
    console.log('[EditorArea] open-file 閻╂垵鎯夐崳?', handleOpenFile);

    // 閻╂垵鎯夐崗鎶芥４閹碘偓閺堝绱潏鎴濇珤娴滃娆?
    const handleCloseAllEditors = () => {
      console.log('');
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

    return () => {
      window.removeEventListener('open-file', handleOpenFile as EventListener);
      window.removeEventListener('editor:replace-active-tab-content', handleReplaceActiveTabContent as EventListener);
      window.removeEventListener('open-settings', handleOpenSettings);
      window.removeEventListener('open-media-panel', handleOpenMediaPanel);
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
      removeOpenNoteInNewWindowListener?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) {
      return;
    }

    const resolveActiveCodeMirrorTarget = (documentUri: string | null): {
      readonly targetTab: EditorTab | null;
      readonly view: import('@codemirror/view').EditorView | null;
      readonly error: string | null;
    } => {
      const targetTab = resolvePluginEditorTab(documentUri);

      if (!targetTab || targetTab.type !== 'file') {
        return {
          targetTab: null,
          view: null,
          error: typeof documentUri === 'string'
            ? `Open editor tab not found for ${documentUri}`
            : 'Open editor tab not found for the active document.',
        };
      }

      const view = getActiveCodeMirrorEditorView();
      const activeMeta = getActiveCodeMirrorEditorMeta();

      if (!view || typeof activeMeta.path !== 'string' || activeMeta.path.trim().length === 0) {
        return {
          targetTab,
          view: null,
          error: 'Active CodeMirror editor is not available.',
        };
      }

      if (normalizeComparableFilePath(activeMeta.path) !== normalizeComparableFilePath(targetTab.path)) {
        return {
          targetTab,
          view: null,
          error: `Active CodeMirror editor does not match ${targetTab.path}`,
        };
      }

      return {
        targetTab,
        view,
        error: null,
      };
    };

    const createSelectionPayload = (
      documentUri: string,
      content: string,
      view: import('@codemirror/view').EditorView,
    ): PluginEditorStateResponsePayload['selection'] => {
      const selection = view.state.selection.main;
      const start = getLineColumnFromOffset(content, selection.from);
      const end = getLineColumnFromOffset(content, selection.to);

      return {
        documentUri,
        text: content.slice(selection.from, selection.to),
        range: {
          startLine: start.line,
          startColumn: start.column,
          endLine: end.line,
          endColumn: end.column,
        },
      };
    };

    const handlePluginEditorStateRequest = (
      _event: Event,
      payload: PluginEditorStateRequestPayload,
    ): void => {
      if (typeof payload?.requestId !== 'string' || payload.requestId.length === 0) {
        return;
      }

      const targetTab = resolvePluginEditorTab(payload.documentUri);
      const targetDocumentUri = targetTab?.path ?? null;
      const resolvedTarget = resolveActiveCodeMirrorTarget(targetDocumentUri);
      const liveContent = resolvedTarget.view?.state.doc.toString()
        ?? targetTab?.content
        ?? null;
      const response: PluginEditorStateResponsePayload = {
        requestId: payload.requestId,
        ok: true,
        documentUri: targetDocumentUri,
        content: liveContent,
        selection: targetDocumentUri !== null
          && liveContent !== null
          && resolvedTarget.view !== null
          ? createSelectionPayload(targetDocumentUri, liveContent, resolvedTarget.view)
          : null,
        hasFocus: resolvedTarget.view?.hasFocus ?? false,
        scroll: resolvedTarget.view === null
          ? null
          : {
              left: resolvedTarget.view.scrollDOM.scrollLeft,
              top: resolvedTarget.view.scrollDOM.scrollTop,
              width: resolvedTarget.view.scrollDOM.scrollWidth,
              height: resolvedTarget.view.scrollDOM.scrollHeight,
              clientWidth: resolvedTarget.view.scrollDOM.clientWidth,
              clientHeight: resolvedTarget.view.scrollDOM.clientHeight,
            },
        error: null,
      };

      ipcRenderer.send(PLUGIN_EDITOR_BRIDGE_CHANNELS.stateResponse, response);
    };

    const handlePluginEditorApplyTextEdits = (
      _event: Event,
      payload: PluginEditorApplyTextEditsRequestPayload,
    ): void => {
      if (typeof payload?.requestId !== 'string' || payload.requestId.length === 0) {
        return;
      }

      const createResponse = (
        ok: boolean,
        error: string | null,
      ): PluginEditorApplyTextEditsResponsePayload => ({
        requestId: payload.requestId,
        ok,
        error,
      });

      if (typeof payload.documentUri !== 'string' || !Array.isArray(payload.edits)) {
        ipcRenderer.send(
          PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEditsResponse,
          createResponse(false, 'Renderer editor bridge payload is invalid.'),
        );
        return;
      }

      try {
        const targetTab = resolvePluginEditorTab(payload.documentUri);
        if (!targetTab || targetTab.type !== 'file') {
          throw new Error(`Open editor tab not found for ${payload.documentUri}`);
        }

        const nextContent = applyTextEditsToContent(targetTab.content ?? '', payload.edits);
        updateFileTabContent(targetTab.id, nextContent, { clearDiffPreview: true });

        ipcRenderer.send(
          PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEditsResponse,
          createResponse(true, null),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ipcRenderer.send(
          PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEditsResponse,
          createResponse(false, message),
        );
      }
    };

    const handlePluginEditorPerformAction = (
      _event: Event,
      payload: PluginEditorPerformActionRequestPayload,
    ): void => {
      if (typeof payload?.requestId !== 'string' || payload.requestId.length === 0) {
        return;
      }

      const createResponse = (
        ok: boolean,
        error: string | null,
      ): PluginEditorPerformActionResponsePayload => ({
        requestId: payload.requestId,
        ok,
        error,
      });

      try {
        const resolvedTarget = resolveActiveCodeMirrorTarget(payload.documentUri);

        if (resolvedTarget.view === null) {
          throw new Error(resolvedTarget.error ?? 'Renderer editor bridge target is unavailable.');
        }

        if (payload.action === 'focus') {
          resolvedTarget.view.focus();
          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        if (payload.action === 'blur') {
          const activeElement = resolvedTarget.view.dom.ownerDocument.activeElement;
          if (activeElement instanceof HTMLElement) {
            activeElement.blur();
          }
          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        if (payload.action === 'set-selection') {
          if (payload.selection === null) {
            throw new Error('Renderer editor bridge selection payload is required.');
          }

          const content = resolvedTarget.view.state.doc.toString();
          resolvedTarget.view.dispatch({
            selection: {
              anchor: getOffsetFromLineColumn(
                content,
                payload.selection.startLine,
                payload.selection.startColumn,
              ),
              head: getOffsetFromLineColumn(
                content,
                payload.selection.endLine,
                payload.selection.endColumn,
              ),
            },
          });
          resolvedTarget.view.focus();
          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        if (payload.action === 'set-selections') {
          if (!Array.isArray(payload.selections) || payload.selections.length === 0) {
            throw new Error('Renderer editor bridge selections payload is required.');
          }

          const content = resolvedTarget.view.state.doc.toString();
          const ranges = payload.selections.map((selection) => EditorSelection.range(
            getOffsetFromLineColumn(content, selection.startLine, selection.startColumn),
            getOffsetFromLineColumn(content, selection.endLine, selection.endColumn),
          ));
          const mainSelectionIndex = typeof payload.mainSelectionIndex === 'number'
            && payload.mainSelectionIndex >= 0
            && payload.mainSelectionIndex < ranges.length
            ? payload.mainSelectionIndex
            : 0;

          resolvedTarget.view.dispatch({
            selection: EditorSelection.create(ranges, mainSelectionIndex),
          });
          resolvedTarget.view.focus();
          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        if (payload.action === 'scroll-to') {
          resolvedTarget.view.scrollDOM.scrollTo({
            left: payload.scrollLeft ?? resolvedTarget.view.scrollDOM.scrollLeft,
            top: payload.scrollTop ?? resolvedTarget.view.scrollDOM.scrollTop,
          });
          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        if (payload.action === 'undo') {
          undo(resolvedTarget.view);
          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        if (payload.action === 'redo') {
          redo(resolvedTarget.view);
          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        if (payload.action === 'exec') {
          if (typeof payload.command !== 'string' || payload.command.trim().length === 0) {
            throw new Error('Renderer editor bridge command payload is invalid.');
          }

          const executed = executePluginEditorCommand(payload.command, resolvedTarget.view);

          if (!executed) {
            throw new Error(`Renderer editor bridge command is not supported: ${payload.command}`);
          }

          ipcRenderer.send(
            PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
            createResponse(true, null),
          );
          return;
        }

        throw new Error(`Renderer editor bridge action is not supported: ${payload.action}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ipcRenderer.send(
          PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
          createResponse(false, message),
        );
      }
    };

    const unsubscribeState = ipcRenderer.on(
      PLUGIN_EDITOR_BRIDGE_CHANNELS.requestState,
      handlePluginEditorStateRequest,
    );
    const unsubscribeApplyTextEdits = ipcRenderer.on(
      PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEdits,
      handlePluginEditorApplyTextEdits,
    );
    const unsubscribePerformAction = ipcRenderer.on(
      PLUGIN_EDITOR_BRIDGE_CHANNELS.performAction,
      handlePluginEditorPerformAction,
    );

    return () => {
      unsubscribeState();
      unsubscribeApplyTextEdits();
      unsubscribePerformAction();
    };
  }, [resolvePluginEditorTab, updateFileTabContent]);

  // 閻╂垵鎯夌悰銊︾壐閸氬秶袨閸欐ɑ娲挎禍瀣╂閿涘牏瀚粩瀣畱 useEffect閿?
  useEffect(() => {
    const handleTableNameChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId: string; newName: string }>;
      const { formId, newName } = customEvent.detail || {};
      
      if (formId && newName) {
        setTabs(currentTabs => 
          currentTabs.map(tab => 
            tab.formId === formId 
              ? {
                ...tab,
                title: translateEditorAreaText('tableDesigner.tabs.named', '表格 - {{name}}', {
                  name: newName,
                }),
              }
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

  // 閻╂垵鎯夐幍鎾崇磻閻儴鐦戞惔鎾茬皑娴犺绱欓悪顒傜彌閻?useEffect閿涘本妫ゆ笟婵婄閿?
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
        // 閺屻儲澹橀弰顖氭儊瀹告彃鐡ㄩ崷銊х叀鐠囧棗绨辩猾璇茬€烽惃鍕垼缁涢箖銆夐敍鍫滅瑝閸栧搫鍨?id閿?
        const existingKnowledgeTab = prev.find(tab => tab.type === 'knowledge');
        
        // 閺嶅洨顒锋い鍨垼妫版ê褰ч弰鍓с仛閻儴鐦戞惔鎾虫倳缁夊府绱濇稉宥呭瘶閸氼偊鍘ょ純顔煎綁閸栨牗褰佺粈?
        const tabTitle = `閻儴鐦戞惔?- ${title}`;
        
        if (existingKnowledgeTab) {
          // 婵″倹鐏夊鎻掔摠閸︺劎鐓＄拠鍡楃氨閺嶅洨顒锋い纰夌礉閺囧瓨鏌婇崗鑸电垼妫版ê鎷伴弫鐗堝祦
          setActiveTabId(existingKnowledgeTab.id);
          console.log('[EditorArea] 閺囧瓨鏌婇惌銉ㄧ槕鎼存挻鐖ｇ粵楣冦€?', tabTitle);
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
          // 閸掓稑缂撻弬鎵畱閻儴鐦戞惔鎾寸垼缁涢箖銆夐敍鍫ヮ浕濞嗏剝澧﹀鈧敍?
          const newTab: EditorTab = {
            id: `knowledge-${Date.now()}`,
            title: tabTitle,
            path: `knowledge:/${id}`,
            isDirty: false,
            type: 'knowledge',
            knowledgeData: { id, items, description }
          };
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 閸掓稑缂撻惌銉ㄧ槕鎼存挻鐖ｇ粵楣冦€?', tabTitle);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    
    return () => {
      window.removeEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    };
  }, []); // 閺冪姳绶风挧鏍电礉閸欘亝鏁為崘灞肩濞?

  // 閻╂垵鎯夐崗鎶芥４閻儴鐦戞惔鎾寸垼缁涢箖銆夋禍瀣╂
  useEffect(() => {
    const handleCloseKnowledgeTab = (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      setTabs(prev => {
        // 閺屻儲澹橀崠褰掑帳閻ㄥ嫮鐓＄拠鍡楃氨閺嶅洨顒锋い?
        const knowledgeTab = prev.find(
          tab => tab.type === 'knowledge' && 
                 (tab.knowledgeData?.id === knowledgeId || tab.path === `knowledge:/${knowledgeId}`)
        );
        
        if (knowledgeTab) {
          console.log('[EditorArea] 閸忔娊妫撮惌銉ㄧ槕鎼存挻鐖ｇ粵楣冦€?', knowledgeTab.title, '閻儴鐦戞惔鎻慏:', knowledgeId);
          
          // 缁夊娅庨惌銉ㄧ槕鎼存挻鐖ｇ粵楣冦€?
          const remainingTabs = prev.filter(tab => tab.id !== knowledgeTab.id);
          
          // 娴ｈ法鏁ら崙鑺ユ殶瀵繑娲块弬鐗堟降閼惧嘲褰囬張鈧弬鎵畱 activeTabId
          setActiveTabId(currentActiveTabId => {
            // 婵″倹鐏夐崗鎶芥４閻ㄥ嫭妲歌ぐ鎾冲濞茶濮╅弽鍥╊劮閿涘矂娓剁憰浣稿瀼閹广垹鍩岄崗鏈电铂閺嶅洨顒?
            if (currentActiveTabId === knowledgeTab.id) {
              if (remainingTabs.length > 0) {
                // 閸掑洦宕查崚鐗堟付閸氬簼绔存稉顏呯垼缁涢箖銆?
                return remainingTabs[remainingTabs.length - 1].id;
              } else {
                // 濞屸剝婀侀崗鏈电铂閺嶅洨顒锋い鍏哥啊閿涘本绔婚梽銈嗘た閸斻劍鐖ｇ粵?
                return null;
              }
            }
            // 娑撳秵妲稿ú璇插З閺嶅洨顒烽敍灞肩箽閹镐礁缍嬮崜宥嗘た閸斻劍鐖ｇ粵鍙ョ瑝閸?
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
  }, []); // 閺冪姳绶风挧鏍电礉閸欘亝鏁為崘灞肩濞?

  // 娣囶喖顦查崙鑺ユ殶閿涙艾鐨㈡潻娑樺娑?100% 娴ｅ棛濮搁幀浣风矝娑?processing 閻ㄥ嫭鏋冩禒鑸垫纯閺傞璐?completed
  const fixProcessingFilesWith100Percent = useCallback(async (knowledgeBase: KnowledgeItem): Promise<boolean> => {
    if (!knowledgeBase.children) {
      return false;
    }
    
    // 闁帒缍婇弻銉﹀閹碘偓閺堝娓剁憰浣锋叏婢跺秶娈戦弬鍥︽閿涘牆瀵橀幏顒€鐡欓弬鍥︽婢堕€涜厬閻ㄥ嫭鏋冩禒璁圭礆
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
      console.log('[EditorArea] 閸欐垹骞囬棁鈧憰浣锋叏婢跺秶娈戦弬鍥︽閿涘潷rocessing 100%閿?', filesToFix.length);
      for (const file of filesToFix) {
        if (file.path) {
          try {
            await knowledgeBaseService.updateFileProcessingStatus(
              file.path,
              'completed',
              100
            );
            console.log('[EditorArea] 瀹歌弓鎱ㄦ径宥嗘瀮娴犲墎濮搁幀?', file.title);
          } catch (error) {
            console.error('[EditorArea] 娣囶喖顦查弬鍥︽閻樿埖鈧礁銇戠拹?', file.title, error);
          }
        }
      }
      return true; // 鐞涖劎銇氶張澶嬫瀮娴犳儼顫︽穱顔碱槻
    }
    return false; // 鐞涖劎銇氬▽鈩冩箒閺傚洣娆㈤棁鈧憰浣锋叏婢?
  }, []);

  // 缂佸嫪娆㈤崚婵嗩潗閸栨牗妞傚Λ鈧弻銉ヨ嫙娣囶喖顦查幍鈧張澶岀叀鐠囧棗绨辨稉顓犳畱 processing 100% 閺傚洣娆?
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
          console.log('');
          // 鐟欙箑褰傞惌銉ㄧ槕鎼存挻娲块弬棰佺皑娴犳湹浜掗崚閿嬫煀UI
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: 'all' }
          }));
        }
      } catch (error) {
        console.error('[EditorArea] 閸掓繂顫愰崠鏍梾閺屻儳鐓＄拠鍡楃氨閺傚洣娆㈤悩鑸碘偓浣搞亼鐠?', error);
      }
    };
    
    checkAndFixAllKnowledgeBases();
  }, [fixProcessingFilesWith100Percent]);

  // 閻╂垵鎯夐惌銉ㄧ槕鎼存挻娲块弬棰佺皑娴犺绱欓崚閿嬫煀閻儴鐦戞惔鎾存殶閹诡噯绱?
  useEffect(() => {
    const handleKnowledgeBaseUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      console.log('[EditorArea] 閻儴鐦戞惔鎾冲嚒閺囧瓨鏌婇敍宀勫櫢閺傛澘濮炴潪鑺ユ殶閹?', knowledgeId);
      
      // 闁插秵鏌婇崝鐘烘祰閻儴鐦戞惔鎾存殶閹?
      const data = await knowledgeBaseService.loadFromStorage();
      
      // 鐠嬪啳鐦敍姘梾閺屻儲鏆熼幑顔昏厬閺勵垰鎯侀崠鍛儓婢跺嫮鎮婇悩鑸碘偓?
      const knowledgeBase = data.created.find(kb => kb.id === knowledgeId);
      if (knowledgeBase && knowledgeBase.children) {
        const filesWithStatus = knowledgeBase.children.filter(
          (item: KnowledgeItem) => item.type === 'file' && item.metadata?.processingStatus
        );
        console.log('[EditorArea] 閹垫儳鍩岀敮锕€顦╅悶鍡欏Ц閹胶娈戦弬鍥︽:', filesWithStatus.length, filesWithStatus.map(item => ({
          title: item.title,
          status: item.metadata?.processingStatus,
          progress: item.metadata?.processingProgress
        })));
        
        // 閼奉亜濮╂穱顔碱槻閿涙艾鐨㈡潻娑樺娑?100% 娴ｅ棛濮搁幀浣风矝娑?processing 閻ㄥ嫭鏋冩禒鑸垫纯閺傞璐?completed
        const hasFixed = await fixProcessingFilesWith100Percent(knowledgeBase);
        if (hasFixed) {
          // 闁插秵鏌婇崝鐘烘祰閺佺増宓佹禒銉ュ冀閺勭姳鎱ㄦ径宥呮倵閻ㄥ嫮濮搁幀?
          const fixedData = await knowledgeBaseService.loadFromStorage();
          // 閺囧瓨鏌?data 瀵洜鏁?
          Object.assign(data, fixedData);
        }
      }
      
      // 閺囧瓨鏌婂锔挎櫠鐎电懓绨查惃鍕叀鐠囧棗绨遍弽鍥╊劮妞ゅ灚鏆熼幑?
      setTabs(prev => {
        const updated = prev.map(tab => {
          if (tab.type === 'knowledge' && tab.knowledgeData?.id === knowledgeId) {
            // 閺屻儲澹橀惌銉ㄧ槕鎼存捇銆嶉敍宀冨箯閸欐牜鐓＄拠鍡楃氨閸氬秶袨
            const knowledgeBase = data.created.find(kb => kb.id === knowledgeId);
            const baseTitle = knowledgeBase?.title || '';
            const configChanged = knowledgeBase?.metadata?.configChanged;
            // 閺嶅洨顒锋い鍨垼妫版ê褰ч弰鍓с仛閻儴鐦戞惔鎾虫倳缁夊府绱濇稉宥呭瘶閸氼偊鍘ょ純顔煎綁閸栨牗褰佺粈?
            const newTitle = `閻儴鐦戞惔?- ${baseTitle}`;
            
            const newTab = {
              ...tab,
              title: newTitle,
              knowledgeData: {
                id: knowledgeId,
                items: data.created,
                description: tab.knowledgeData?.description // 娣囨繄鏆€閸樼喐婀侀幓蹇氬牚
              }
            };
            console.log('[EditorArea] 閺囧瓨鏌婂锔挎櫠閻儴鐦戞惔鎾寸垼缁涢箖銆夐弫鐗堝祦:', {
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
      
      // 閺囧瓨鏌婇崣鍏呮櫠鐎电懓绨查惃鍕叀鐠囧棗绨遍弽鍥╊劮妞ゅ灚鏆熼幑?
      setRightTabs(prev => {
        const updated = prev.map(tab => {
          if (tab.type === 'knowledge' && tab.knowledgeData?.id === knowledgeId) {
            // 閺屻儲澹橀弴瀛樻煀閸氬海娈戦惌銉ㄧ槕鎼存挻鏆熼幑?
            const updatedKnowledgeBase = data.created.find(kb => kb.id === knowledgeId);
            const baseTitle = updatedKnowledgeBase?.title || '';
            const configChanged = updatedKnowledgeBase?.metadata?.configChanged;
            // 閺嶅洨顒锋い鍨垼妫版ê褰ч弰鍓с仛閻儴鐦戞惔鎾虫倳缁夊府绱濇稉宥呭瘶閸氼偊鍘ょ純顔煎綁閸栨牗褰佺粈?
            const newTitle = `閻儴鐦戞惔?- ${baseTitle}`;
            
            const newTab = {
              ...tab,
              title: newTitle,
              knowledgeData: {
                id: knowledgeId,
                items: data.created,
                description: tab.knowledgeData?.description // 娣囨繄鏆€閸樼喐婀侀幓蹇氬牚
              }
            };
            console.log('[EditorArea] 閺囧瓨鏌婇崣鍏呮櫠閻儴鐦戞惔鎾寸垼缁涢箖銆夐弫鐗堝祦:', {
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

  // 閻╂垵鎯夐幍鎾崇磻 AI 闁板秶鐤嗘禍瀣╂閿涘牏瀚粩瀣畱 useEffect閿涘本妫ゆ笟婵婄閿?
  useEffect(() => {
    const handleOpenAIConfig = async (event: Event) => {
      const customEvent = event as CustomEvent<{ configId?: string; configIndex?: number }>;
      // 娴兼ê鍘涙担璺ㄦ暏 configId閿涘苯顩ч弸婊勭梾閺堝鍨担璺ㄦ暏 configIndex閿涘牆鎮滈崥搴″悑鐎圭櫢绱?
      const configId = customEvent?.detail?.configId;
      const configIndex = customEvent?.detail?.configIndex;
      
      console.log('[EditorArea] 閹垫挸绱?AI 闁板秶鐤嗛敍宀勫帳缂冪攢D:', configId, '闁板秶鐤嗙槐銏犵穿(鎼寸喎绱?:', configIndex);
      
      // 婵″倹鐏夊▽鈩冩箒 configId閿涘苯鐨剧拠鏇氱矤 configIndex 閼惧嘲褰囬柊宥囩枂娣団剝浼?
      let actualConfigId = configId;
      let configName = translateEditorAreaText('aiConfigView.header.createTitle', 'AI 模型配置');
      
      if (!actualConfigId && configIndex !== undefined) {
        try {
          const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
          if (configs && configs[configIndex]) {
            actualConfigId = configs[configIndex].id;
            configName = configs[configIndex].name || configName;
          }
        } catch (error) {
          console.error('[EditorArea] 娴犲海鍌ㄥ鏇″箯閸欐牠鍘ょ純鐢€D婢惰精瑙?', error);
        }
      }
      
      // 婵″倹鐏夊▽鈩冩箒 configId 娑旂喐鐥呴張?configIndex閿涘苯鍨卞鐑樻煀闁板秶鐤?
      if (!actualConfigId) {
        console.log('');
        const tempConfigId = `temp-config-${Date.now()}`;
        
        setTabs(prev => {
          const newTab: EditorTab = {
            id: `ai-config-${Date.now()}`,
            title: translateEditorAreaText(
              'aiConfigView.header.createTitle',
              'AI 模型配置',
            ),
            path: `ai-config:/${tempConfigId}`,
            isDirty: false,
            type: 'ai-config',
            configId: tempConfigId
          };
          
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 閸掓稑缂撻弬鎵畱 AI 闁板秶鐤嗛弽鍥╊劮妞ゅ灚鍨氶崝鐕傜礉閺嶅洨顒稩D:', newTab.id);
          return [...prev, newTab];
        });
        return;
      }
      
      // 閼惧嘲褰囬柊宥囩枂娣団剝浼呴敍鍫㈡暏娴滃孩鐖ｆ０姗堢礆
      if (configId && !configName) {
        try {
          const config = await window.electron?.ipcRenderer.invoke('ai-model:get', actualConfigId);
          if (config && config.name) {
            configName = config.name;
          }
        } catch (error) {
          console.error('[EditorArea] 閼惧嘲褰囬柊宥囩枂閸氬秶袨婢惰精瑙?', error);
        }
      }
      
      setTabs(prev => {
        // 閺屻儲澹橀弰顖氭儊瀹告彃鐡ㄩ崷銊ф祲閸氬畱onfigId閻ㄥ嚈I闁板秶鐤嗛弽鍥╊劮妞?
        const existingAIConfigTab = prev.find(tab => 
          tab.type === 'ai-config' && tab.configId === actualConfigId
        );
        
        if (existingAIConfigTab) {
          // 婵″倹鐏夊鎻掔摠閸︺劎娴夐崥宀€娈慉I闁板秶鐤嗛弽鍥╊劮妞ょ绱濋惄瀛樺复濠碘偓濞茶鐣?
          setActiveTabId(existingAIConfigTab.id);
          console.log('[EditorArea] 濠碘偓濞茶鍑＄€涙ê婀惃?AI 闁板秶鐤嗛弽鍥╊劮妞ょ绱濋柊宥囩枂ID:', actualConfigId, '閺嶅洨顒稩D:', existingAIConfigTab.id);
          return prev; // 娑撳秳鎱ㄩ弨?tabs
        } else {
          // 娑撳秴鐡ㄩ崷銊ф祲閸氬瞼娈慉I闁板秶鐤嗛弽鍥╊劮妞ょ绱濋崚娑樼紦閺傛壆娈?
          console.log('[EditorArea] 閸掓稑缂撻弬鎵畱 AI 闁板秶鐤嗛弽鍥╊劮妞ょ绱濋柊宥囩枂ID:', actualConfigId, '闁板秶鐤嗛崥宥囆?', configName);
          
          const tabPath = `ai-config:/${actualConfigId}`;
          const newTab: EditorTab = {
            id: `ai-config-${Date.now()}`,
            title: translateEditorAreaText(
              'aiConfigView.header.editTitle',
              '配置 - {{name}}',
              { name: configName },
            ),
            path: tabPath,
            isDirty: false,
            type: 'ai-config',
            configId: actualConfigId,
            configIndex // 娣囨繄鏆€閻劋绨崥鎴濇倵閸忕厧顔?
          };
          
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 閸掓稑缂撻弬鎵畱 AI 闁板秶鐤嗛弽鍥╊劮妞ゅ灚鍨氶崝鐕傜礉閺嶅洨顒稩D:', newTab.id);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-ai-config', handleOpenAIConfig as EventListener);
    
    return () => {
      window.removeEventListener('open-ai-config', handleOpenAIConfig as EventListener);
    };
  }, []); // 閺冪姳绶风挧鏍电礉閸欘亝鏁為崘灞肩濞?

  // 閻╂垵鎯?AI 闁板秶鐤嗘穱婵嗙摠娴滃娆㈤敍灞炬纯閺傞澶嶉弮鍫曞帳缂冾喚娈?ID
  useEffect(() => {
    const handleAIConfigSaved = (event: Event) => {
      const customEvent = event as CustomEvent<{ tempId: string; realId: string; configName: string }>;
      const { tempId, realId, configName } = customEvent.detail;
      
      console.log('[EditorArea] 閺€璺哄煂 AI 闁板秶鐤嗘穱婵嗙摠娴滃娆㈤敍灞炬纯閺傞澶嶉弮鍫曞帳缂冪攢D:', { tempId, realId, configName });
      
      setTabs(prev => {
        return prev.map(tab => {
          if (tab.type === 'ai-config' && tab.configId === tempId) {
            console.log('[EditorArea] 閺囧瓨鏌婇弽鍥╊劮妞?configId:', { oldId: tempId, newId: realId });
            return {
              ...tab,
              configId: realId,
              title: translateEditorAreaText(
                'aiConfigView.header.editTitle',
                '配置 - {{name}}',
                { name: configName },
              ),
            };
          }
          return tab;
        });
      });
      
      // 娴犲孩婀穱婵嗙摠閸掓銆冩稉顓犘╅梽銈忕礄娴ｈ法鏁ら弬鎵畱 realId閿?
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

  // 閻╂垵鎯?AI 闁板秶鐤嗛張顏冪箽鐎涙濮搁幀浣稿綁閸?
  useEffect(() => {
    const handleUnsavedStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{ configId: string; hasUnsavedChanges: boolean }>;
      const { configId, hasUnsavedChanges } = customEvent.detail;
      
      console.log('[EditorArea] 閺€璺哄煂 AI 闁板秶鐤嗛張顏冪箽鐎涙濮搁幀?', { configId, hasUnsavedChanges });
      
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

  // 閻╂垵鎯?AI 闁板秶鐤嗛弴瀛樻煀娴滃娆㈤敍灞炬纯閺傜増鐖ｇ粵楣冦€夐弽鍥暯閿涘牏瀚粩瀣畱 useEffect閿涘本妫ゆ笟婵婄閿?
  useEffect(() => {
    const handleAIConfigUpdated = async () => {
      try {
        console.log('[EditorArea] 閺€璺哄煂 AI 闁板秶鐤嗛弴瀛樻煀娴滃娆㈤敍灞界磻婵娲块弬鐗堢垼缁涢箖銆夐弽鍥暯');
        
        // 閼惧嘲褰囬張鈧弬鎵畱闁板秶鐤嗛崚妤勩€?
        const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
        if (!configs || configs.length === 0) {
          console.log('');
          return;
        }
        
        // 閸掓稑缂撻柊宥囩枂ID閸掍即鍘ょ純顔碱嚠鐠烇紕娈戦弰鐘茬殸
        const configMap = new Map<string, { id: string; name: string }>(
          configs.map((c: { id: string; name: string }) => [c.id, c])
        );
        
        // 閺囧瓨鏌婇幍鈧張?AI 闁板秶鐤嗛弽鍥╊劮妞ょ數娈戦弽鍥暯
        setTabs(prev => {
          const updated = prev.map(tab => {
            if (tab.type === 'ai-config') {
              // 娴兼ê鍘涙担璺ㄦ暏 configId
              if (tab.configId) {
                const config = configMap.get(tab.configId);
                if (config?.name) {
                  const newTitle = translateEditorAreaText(
                    'aiConfigView.header.editTitle',
                    '配置 - {{name}}',
                    { name: config.name },
                  );
                  console.log('[EditorArea] 閺囧瓨鏌婇弽鍥╊劮妞ゅ灚鐖ｆ０?闁俺绻僣onfigId):', { oldTitle: tab.title, newTitle, configId: tab.configId });
                  return { ...tab, title: newTitle };
                }
              } 
              // 閸氭垵鎮楅崗鐓庮啇閿涙艾顩ч弸婊勭梾閺?configId閿涘奔濞囬悽?configIndex
              else if (tab.configIndex !== undefined) {
                const config = configs[tab.configIndex];
                if (config?.name) {
                  const newTitle = translateEditorAreaText(
                    'aiConfigView.header.editTitle',
                    '配置 - {{name}}',
                    { name: config.name },
                  );
                  console.log('[EditorArea] 閺囧瓨鏌婇弽鍥╊劮妞ゅ灚鐖ｆ０?闁俺绻僣onfigIndex):', { oldTitle: tab.title, newTitle, configIndex: tab.configIndex });
                  // 閸氬本妞傞弴瀛樻煀 configId 娴犮儰绌堕崥搴ｇ敾娴ｈ法鏁?
                  return { ...tab, title: newTitle, configId: config.id };
                }
              }
            }
            return tab;
          });
          return updated;
        });
        
        console.log('');
      } catch (error) {
        console.error('[EditorArea] 閺囧瓨鏌?AI 闁板秶鐤嗛弽鍥╊劮妞ゅ灚鐖ｆ０妯恒亼鐠?', error);
      }
    };

    window.addEventListener('ai-config-updated', handleAIConfigUpdated);
    
    // 閻╂垵鎯?IPC 濞戝牊浼呴敍鍫㈡暏娴滃簼瀵屾潻娑氣柤闁氨鐓￠惃鍕纯閺傚府绱?
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
  }, []); // 閺冪姳绶风挧鏍电礉閸欘亝鏁為崘灞肩濞?

  const dispatchActiveFileSelection = useCallback((tab: EditorTab | null | undefined): void => {
    if (!tab) {
      return;
    }

    const sourcePath = tab.type === 'file'
      ? tab.path
      : tab.type === 'plugin-view'
        ? (tab.pluginViewData?.sourcePath ?? null)
        : null;

    if (!sourcePath) {
      return;
    }

    window.dispatchEvent(new CustomEvent('editor-active-file-change', {
      detail: { path: sourcePath }
    }));
    window.dispatchEvent(new CustomEvent('tab-switched', {
      detail: { path: sourcePath }
    }));
  }, []);

  // 瑜版挻妞块崝銊︾垼缁涚偓鏁奸崣妯绘閿涘矂鈧氨鐓￠弬鍥︽閺嶆垶娲块弬浼粹偓澶夎厬閻樿埖鈧?
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
    
    dispatchActiveFileSelection(activeTab ?? null);
    tabChangeReasonOverrideRef.current = null;
    previousTabsLengthRef.current = tabs.length;
    previousActiveTabIdRef.current = activeTabId;
  }, [activeTabId, dispatchActiveFileSelection, tabs]);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // 瑜版挻妞块崝銊︾垼缁涢箖銆夐崣妯哄閺冭绱濋柅姘辩叀閻樿埖鈧焦鐖弴瀛樻煀鐠囶叀鈻堢猾璇茬€?
  useEffect(() => {
    if (activeTab?.language) {
      const event = new CustomEvent('tab:language-changed', {
        detail: { language: activeTab.language }
      });
      window.dispatchEvent(event);
    }
  }, [activeTab?.language, activeTabId]);

  const requestPluginViewActivation = useCallback((tab: EditorTab | undefined): void => {
    const leafId = tab?.pluginViewData?.leafId;

    if (!leafId) {
      return;
    }

    void window.electron?.ipcRenderer.invoke('plugin-runtime:request-activate-view', {
      leafId,
    });
  }, []);

  const requestPluginViewClose = useCallback((tab: EditorTab | undefined): void => {
    const leafId = tab?.pluginViewData?.leafId;

    if (!leafId) {
      return;
    }

    void window.electron?.ipcRenderer.invoke('plugin-runtime:request-close-view', {
      leafId,
    });
  }, []);

  const splitPluginViewToPane = useCallback(async (
    tab: EditorTab,
    targetPaneId: EditorPaneId,
  ): Promise<boolean> => {
    const sourcePath = tab.pluginViewData?.sourcePath ?? null;

    if (tab.type !== 'plugin-view' || !isCanvasRuntimePath(sourcePath)) {
      return false;
    }

    const normalizedSourcePath = normalizeComparableFilePath(sourcePath);
    const existingTargetTab = getPaneTabs(targetPaneId).find((candidate) => (
      candidate.type === 'plugin-view'
      && normalizeComparableFilePath(candidate.pluginViewData?.sourcePath ?? '') === normalizedSourcePath
    ));

    if (existingTargetTab) {
      setPaneActiveTabId(targetPaneId, existingTargetTab.id);
      setFocusedPaneId(targetPaneId);
      return true;
    }

    ensurePaneVisibleForDrop(targetPaneId);
    queuePendingPluginViewPaneTarget(sourcePath, {
      paneId: targetPaneId,
      active: true,
    });

    const opened = await window.electron?.ipcRenderer.invoke(
      'plugin-runtime:request-open-workspace-file',
      sourcePath,
      { forceNewLeaf: true },
    ) === true;

    if (opened) {
      return true;
    }

    const pendingQueue = pendingPluginViewPaneBySourcePathRef.current.get(normalizedSourcePath) ?? [];
    const queuedIndex = pendingQueue.findIndex((item) => (
      item.paneId === targetPaneId && item.active === true
    ));
    const nextQueue = queuedIndex >= 0
      ? pendingQueue.filter((_, index) => index !== queuedIndex)
      : pendingQueue;

    if (nextQueue.length > 0) {
      pendingPluginViewPaneBySourcePathRef.current.set(normalizedSourcePath, nextQueue);
    } else {
      pendingPluginViewPaneBySourcePathRef.current.delete(normalizedSourcePath);
    }

    toastService.info('白板拆分失败，未能创建新的白板视图');
    return false;
  }, [
    ensurePaneVisibleForDrop,
    getPaneTabs,
    queuePendingPluginViewPaneTarget,
    setPaneActiveTabId,
  ]);

  // 婢跺嫮鎮婇弽鍥╊劮妞ら潧鍨忛幑?
  const handleTabClick = (tabId: string) => {
    tabChangeReasonOverrideRef.current = 'switch';
    setActiveTabId(tabId);
    setFocusedPaneId('left-top');
    
    const clickedTab = tabs.find(tab => tab.id === tabId);
    const clickedTabPath = clickedTab?.type === 'file'
      ? clickedTab.path
      : clickedTab?.pluginViewData?.sourcePath ?? null;
    if (clickedTabPath) {
      window.dispatchEvent(new CustomEvent('tab-switched', {
        detail: { path: clickedTabPath }
      }));
      window.dispatchEvent(new CustomEvent('editor-active-file-change', {
        detail: { path: clickedTabPath }
      }));
      console.log('[EditorArea] 閺嶅洨顒锋い闈涘瀼閹?', clickedTabPath);
    }

    if (clickedTab?.type === 'plugin-view') {
      requestPluginViewActivation(clickedTab);
    }
    
    // 婵″倹鐏夐弰顖濄€冮弽鑹邦啎鐠佲€虫珤閺嶅洨顒锋い纰夌礉闁氨鐓℃笟褑绔熼弽蹇旀纯閺傛媽銆冮崡鏇⑩偓澶夎厬閻樿埖鈧?
    if (clickedTab?.type === 'table-designer' && clickedTab?.formId) {
      window.dispatchEvent(new CustomEvent('form-tab-activated', {
        detail: { formId: clickedTab.formId }
      }));
    } else {
      // 闂堢偠銆冮弽鑹邦啎鐠佲€虫珤閺嶅洨顒锋い纰夌礉濞撳懘娅庣悰銊ュ礋闁鑵戦悩鑸碘偓?
      window.dispatchEvent(new Event('form-tab-deactivated'));
    }
  };

  const handleSplit = (tabId: string, direction: SplitDirection) => {
    const located = findPaneByTabId(tabId);
    if (!located || (located.tab.type !== 'file' && located.tab.type !== 'plugin-view')) {
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

    if (located.tab.type === 'plugin-view') {
      void splitPluginViewToPane(located.tab, targetPaneId);
      return;
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

    toastService.info('鏆備笉鏀寔鍦ㄦ柊绐楀彛鎵撳紑锛屽凡涓轰綘鍦ㄥ彸渚у垎灞忔墦寮€');
    handleSplitHorizontal(tabId);
  };

  const handleTabClose = (tabId: string) => {
    tabChangeReasonOverrideRef.current = 'close';
    const closingTab = tabs.find(tab => tab.id === tabId);
    disposeTabResources(closingTab);
    requestPluginViewClose(closingTab);
    
    // 婵″倹鐏夐弰?AI 闁板秶鐤嗛弽鍥╊劮妞ょ绱濆Λ鈧弻銉︽Ц閸氾附婀侀張顏冪箽鐎涙娈戦弴瀛樻暭
    if (closingTab?.type === 'ai-config' && closingTab.configId) {
      if (unsavedConfigTabs.has(closingTab.configId)) {
        // 閺勫墽銇氱涵顔款吇鐎电鐦藉?
        const confirmed = window.confirm(
          '鎮ㄦ湁鏈繚瀛樼殑鏇存敼锛屽叧闂悗灏嗕涪澶便€俓n\n纭畾瑕佸叧闂悧锛?'
        );
        
        if (!confirmed) {
          console.log('[EditorArea] 閻劍鍩涢崣鏍ㄧХ閸忔娊妫撮張顏冪箽鐎涙娈戦柊宥囩枂');
          return; // 閻劍鍩涢崣鏍ㄧХ閸忔娊妫?
        }
        
        // 閻劍鍩涚涵顔款吇閸忔娊妫撮敍灞肩矤閺堫亙绻氱€涙ê鍨悰銊よ厬缁夊娅?
        setUnsavedConfigTabs(prev => {
          const newSet = new Set(prev);
          newSet.delete(closingTab.configId!);
          return newSet;
        });
      }
    }
    
    // 婵″倹鐏夐弰顖濄€冮弽鑹邦啎鐠佲€虫珤閺嶅洨顒锋い纰夌礉閼奉亜濮╂穱婵嗙摠閺佺増宓?
    if (closingTab?.type === 'table-designer' && closingTab.formId) {
      saveAndRemoveTableDataService(closingTab.formId).then(success => {
        if (success) {
          console.log('[EditorArea] 鐞涖劍鐗搁弫鐗堝祦閼奉亜濮╂穱婵嗙摠閹存劕濮?', closingTab.formId);
        } else {
          console.warn('[EditorArea] 鐞涖劍鐗搁弫鐗堝祦閼奉亜濮╂穱婵嗙摠婢惰精瑙?', closingTab.formId);
        }
      });
    }
    
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    const nextTabHistory = removeTabIdFromHistory(tabActivationHistoryRef.current, tabId);
    tabActivationHistoryRef.current = nextTabHistory;
    setTabs(newTabs);
    
    // 闁氨鐓?FileExplorer 缁夊娅庣€电懓绨查惃鍕椽鏉堟垵娅掗敍鍫滅矌闁藉牆顕弬鍥︽缁鐎烽惃鍕垼缁涢箖銆夐敍?
    if (closingTab?.type === 'file' && closingTab?.path) {
      window.dispatchEvent(new CustomEvent('remove-editor', {
        detail: { path: closingTab.path }
      }));
      console.log('[EditorArea] 闁氨鐓?FileExplorer 缁夊娅庣紓鏍帆閸?', closingTab.path);
    }
    
    // 婵″倹鐏夐崗鎶芥４閻ㄥ嫭妲?AI 闁板秶鐤嗛弽鍥╊劮妞ょ绱濋柅姘辩叀娓氀嗙珶閺嶅繑绔婚梽銈夆偓澶夎厬閻樿埖鈧?
    if (closingTab?.type === 'ai-config') {
      window.dispatchEvent(new Event('ai-config-tab-closed'));
      console.log('[EditorArea] AI 闁板秶鐤嗛弽鍥╊劮妞ら潧鍑￠崗鎶芥４');
    }
    
    // 婵″倹鐏夐崗鎶芥４閻ㄥ嫭妲哥悰銊︾壐鐠佹崘顓搁崳銊︾垼缁涢箖銆夐敍宀勨偓姘辩叀娓氀嗙珶閺嶅繑绔婚梽銈堛€冮崡鏇⑩偓澶夎厬閻樿埖鈧?
    if (closingTab?.type === 'table-designer') {
      window.dispatchEvent(new CustomEvent('form-tab-closed', {
        detail: { formId: closingTab.formId }
      }));
    }
    
    if (activeTabId === tabId) {
      const nextActiveTabId = getMostRecentTabId(nextTabHistory, newTabs);
      setActiveTabId(nextActiveTabId);
      
      // 闁氨鐓?FileExplorer 閺囧瓨鏌婇柅澶夎厬閻樿埖鈧礁鍩屾稉瀣╃娑擃亝鐖ｇ粵楣冦€?
      const nextTab = nextActiveTabId
        ? newTabs.find(tab => tab.id === nextActiveTabId)
        : null;
      const nextTabPath = nextTab?.type === 'file'
        ? nextTab.path
        : nextTab?.pluginViewData?.sourcePath ?? null;
      if (nextTabPath) {
        window.dispatchEvent(new CustomEvent('tab-switched', {
          detail: { path: nextTabPath }
        }));
        window.dispatchEvent(new CustomEvent('editor-active-file-change', {
          detail: { path: nextTabPath }
        }));
        console.log('[EditorArea] 閸忔娊妫撮崥搴″瀼閹广垹鍩屾稉瀣╃娑擃亝鐖ｇ粵楣冦€?', nextTabPath);
      }
    }
    
    // 閸忔娊妫村┃鎰瀮濡楋絾妞傞敍灞芥倱閺冭泛鍙ч梻顓烆嚠鎼存梻娈戞０鍕潔閺嶅洨顒锋い?
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
      
      // 婵″倹鐏夐崗鎶芥４閻ㄥ嫰顣╃憴鍫熺垼缁涚偓妲歌ぐ鎾冲濠碘偓濞茶崵娈戦敍灞藉瀼閹广垹鍩岀粭顑跨娑?
      if (rightActiveTabId && !newRightTabs.find(tab => tab.id === rightActiveTabId)) {
        const nextRightActiveTabId = getMostRecentTabId(nextRightHistory, newRightTabs);
        if (nextRightActiveTabId) {
          setRightActiveTabId(nextRightActiveTabId);
        } else {
          setRightActiveTabId(null);
          // 閸欏厖鏅跺▽鈩冩箒閺嶅洨顒锋い鍏哥啊閿涘苯鍙ч梻顓炲瀻閸撹尪顫嬮崶?
          if (rightBottomTabs.length === 0 && extraRightSplitPanes.length === 0) {
            setIsSplitView(false);
          }
        }
      }
    }
  };

  const handleRightTabClose = (tabId: string) => {
    const closingTab = rightTabs.find(tab => tab.id === tabId);
    disposeTabResources(closingTab);
    requestPluginViewClose(closingTab);
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
      // 閸欏厖鏅跺▽鈩冩箒閺嶅洨顒锋い鍏哥啊閿涘苯鍙ч梻顓炲瀻閸撹尪顫嬮崶?
      setIsSplitView(false);
    }
  };

  const handleLeftBottomTabClose = (tabId: string) => {
    const closingTab = leftBottomTabs.find(tab => tab.id === tabId);
    disposeTabResources(closingTab);
    requestPluginViewClose(closingTab);
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
    const closingTab = rightBottomTabs.find(tab => tab.id === tabId);
    disposeTabResources(closingTab);
    requestPluginViewClose(closingTab);
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

    const clickedTabPath = clickedTab.type === 'file'
      ? clickedTab.path
      : clickedTab.pluginViewData?.sourcePath ?? null;
    if (clickedTabPath) {
      window.dispatchEvent(new CustomEvent('tab-switched', {
        detail: { path: clickedTabPath }
      }));
      window.dispatchEvent(new CustomEvent('editor-active-file-change', {
        detail: { path: clickedTabPath }
      }));
    }

    if (clickedTab.type === 'plugin-view') {
      requestPluginViewActivation(clickedTab);
    }
  };

  const handleLeftBottomTabClick = (tabId: string) => {
    setLeftBottomActiveTabId(tabId);
    setFocusedPaneId('left-bottom');
    const clickedTab = leftBottomTabs.find(tab => tab.id === tabId);
    const clickedTabPath = clickedTab?.type === 'file'
      ? clickedTab.path
      : clickedTab?.pluginViewData?.sourcePath ?? null;
    if (clickedTabPath) {
      window.dispatchEvent(new CustomEvent('tab-switched', {
        detail: { path: clickedTabPath }
      }));
      window.dispatchEvent(new CustomEvent('editor-active-file-change', {
        detail: { path: clickedTabPath }
      }));
    }
    requestPluginViewActivation(clickedTab);
  };

  const handleRightBottomTabClick = (tabId: string) => {
    setRightBottomActiveTabId(tabId);
    setFocusedPaneId('right-bottom');
    const clickedTab = rightBottomTabs.find(tab => tab.id === tabId);
    const clickedTabPath = clickedTab?.type === 'file'
      ? clickedTab.path
      : clickedTab?.pluginViewData?.sourcePath ?? null;
    if (clickedTabPath) {
      window.dispatchEvent(new CustomEvent('tab-switched', {
        detail: { path: clickedTabPath }
      }));
      window.dispatchEvent(new CustomEvent('editor-active-file-change', {
        detail: { path: clickedTabPath }
      }));
    }
    requestPluginViewActivation(clickedTab);
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
      requestPluginViewClose(tab);
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
    requestPluginViewClose,
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
    if (!located) {
      return;
    }

    if (located.tab.type === 'plugin-view') {
      const targetPaneId = resolveDirectionalTargetPane(located.paneId, direction);
      if (!targetPaneId) {
        toastService.info('褰撳墠鏂瑰悜鏃犳硶鍒嗗睆');
        return;
      }

      void splitPluginViewToPane(located.tab, targetPaneId);
      return;
    }

    if (located.tab.type !== 'file') {
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
      toastService.info('褰撳墠鏂瑰悜鏃犳硶鍒嗗睆');
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
    moveTabToPane,
    splitPluginViewToPane,
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
      toastService.info('褰撳墠鏂瑰悜鏃犳硶绉诲姩');
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
      console.error('[EditorArea] 鍦ㄨ祫婧愮鐞嗗櫒涓墦寮€澶辫触:', error);
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

  // 灏嗗綋鍓嶆椿鍔ㄦ枃浠跺悓姝ュ埌 note-system锛屼緵鍙屽悜閾炬帴/鍙嶅悜閾炬帴鏌ヨ浣跨敤
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
        console.error('[EditorArea] 鍚屾褰撳墠鏂囦欢鍒?note-system 澶辫触:', error);
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

  // 娣囨繂鐡ㄩ弬鍥︽閸戣姤鏆?
  const saveFile = async (tab: EditorTab) => {
    if (!tab || tab.type !== 'file') {
      return;
    }

    // 婵″倹鐏夐弰?settings.json閿涘苯鍑＄紒蹇氬殰閸斻劋绻氱€涙﹫绱濇稉宥夋付鐟曚礁鍟€濞嗏€茬箽鐎?
    if (tab.path === 'settings:/settings.json') {
      updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
      return;
    }

    // 濡偓閺屻儲妲搁崥锔芥Ц娑撳顣界憰鍡欐磰閺傚洣娆㈤敍鍧県eme-override:// 閸楀繗顔呴敍?
    const isThemeOverride = tab.path.startsWith('theme-override://');
    
    // 婵″倹鐏夐弰顖欏瘜妫版顩惄鏍ㄦ瀮娴犺绱濇担璺ㄦ暏娑撳顣界憰鍡欐磰娣囨繂鐡ˋPI
    if (isThemeOverride) {
      try {
        console.log('[EditorArea] 婢跺嫮鎮婃稉濠氼暯鐟曞棛娲婇弬鍥︽娣囨繂鐡?', tab.path);
        
        // 娴犲氦鐭惧鍕絹閸欐牕鐔€绾偓娑撳顣絀D
        // 娓氬顩ч敍姝礹eme-override://quiet-light.json 閳?quiet-light
        const baseThemeId = tab.path.replace('theme-override://', '').replace('.json', '');
        console.log('[EditorArea] 閸╄櫣顢呮稉濠氼暯ID:', baseThemeId);
        
        // 鐟欙絾鐎芥０婊嗗鐟曞棛娲婇崘鍛啇
        const parseErrors: jsonc.ParseError[] = [];
        const parsedConfig = jsonc.parse(tab.content || '', parseErrors, {
          allowTrailingComma: true,
          allowEmptyContent: false
        });
        
        // 濡偓閺屻儴袙閺嬫劙鏁婄拠?
        if (parseErrors.length > 0) {
          console.warn('');
          updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
          return;
        }
        
        // 妤犲矁鐦夐弽鐓庣础閿涙艾绻€妞よ瀵橀崥?colors 鐎电钖?
        if (!parsedConfig || !parsedConfig.colors) {
          console.warn('');
          toastService.error('娣囨繂鐡ㄦ径杈Е', {
            description: '娑撳顣界憰鍡欐磰閺傚洣娆㈣箛鍛淬€忛崠鍛儓 colors 鐎涙顔?'
          });
          return;
        }
        
        console.log('');
        console.log('[EditorArea] 閸╄櫣顢呮稉濠氼暯:', baseThemeId);
        console.log('[EditorArea] 鐟曞棛娲婃０婊嗗閺佷即鍣?', Object.keys(parsedConfig.colors || {}).length);
        
        // 鐠嬪啰鏁?IPC 娣囨繂鐡ㄦ稉濠氼暯鐟曞棛娲婇崚鐗堟瀮娴犲墎閮寸紒?
        // 娴肩娀鈧帪绱伴崺铏诡攨娑撳顣絀D + 鐟曞棛娲婇惃鍕杹閼?
        try {
          const result = await window.electron?.ipcRenderer.invoke('theme:save-override', {
            baseThemeId,
            colors: parsedConfig.colors || {}
          });
          
          if (result?.success) {
            console.log('[EditorArea] 閴?娑撳顣界憰鍡欐磰瀹稿弶鍨氶崝鐔剁箽鐎?', baseThemeId);
            toastService.success('娑撳顣界憰鍡欐磰娣囨繂鐡ㄩ幋鎰', {
              description: `宸蹭繚瀛?${Object.keys(parsedConfig.colors || {}).length} 涓鑹茶鐩朻`
            });
            // 濞撳懘娅庨懘蹇旂垼鐠佸府绱濈悰銊с仛瀹歌弓绻氱€?
            updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
          } else {
            console.error('[EditorArea] 娣囨繂鐡ㄦ稉濠氼暯鐟曞棛娲婃径杈Е:', result?.error);
            toastService.error('娣囨繂鐡ㄦ稉濠氼暯鐟曞棛娲婃径杈Е', {
              description: result?.error || '閺堫亞鐓￠柨娆掝嚖'
            });
          }
        } catch (error) {
          console.error('[EditorArea] 鐠嬪啰鏁ゆ稉濠氼暯鐟曞棛娲婃穱婵嗙摠 IPC 婢惰精瑙?', error);
          toastService.error('娣囨繂鐡ㄦ稉濠氼暯鐟曞棛娲婃径杈Е', {
            description: error instanceof Error ? error.message : '鐠嬪啰鏁ゆ穱婵嗙摠閹恒儱褰涙径杈Е'
          });
        }
      } catch (error) {
        console.error('[EditorArea] 婢跺嫮鎮婃稉濠氼暯鐟曞棛娲婃穱婵嗙摠閺冭泛褰傞悽鐔兼晩鐠?', error);
        // 閸欐垹鏁撻柨娆掝嚖閺冩湹绮涢悞鑸电闂勩倛鍓伴弽鍥唶
        updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
      }
      return;
    }

    // 婵″倹鐏夐弰顖涙￥鐠侯垰绶為弬鍥︽閿涘奔濞囬悽銊ュ綗鐎涙ü璐?
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
          window.dispatchEvent(new CustomEvent<FileSavedDetail>('file-saved', {
            detail: {
              path: result.data.path,
              tabId: tab.id,
            },
          }));
        }
      } catch (error) {
        // 閸欙箑鐡ㄦ稉鐑樻瀮娴犺泛銇戠拹銉礉闂堟瑩绮径鍕倞
      }
      return;
    }

    // 娣囨繂鐡ㄩ弬鍥︽
    try {
      // 婵″倹鐏夐崘鍛啇閺?HTML 閺嶇厧绱￠敍宀冩祮閹诡澀璐?Markdown 娣囨繂鐡?
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
        // 濞撳懘娅庨懘蹇旂垼鐠?
        updateTabInAllPanes(tab.id, current => ({ ...current, isDirty: false }));
        if (syncedNote) {
          setCurrentNote(syncedNote);
        }
        window.dispatchEvent(new CustomEvent<FileSavedDetail>('file-saved', {
          detail: {
            path: tab.path,
            tabId: tab.id,
          },
        }));
      }
    } catch (error) {
      // 娣囨繂鐡ㄩ弬鍥︽瀵倸鐖堕敍宀勬饯姒涙ê顦╅悶?
    }
  };

  // 閻╂垵鎯夊ú璇插З閺嶅洨顒锋い闈涘綁閸栨牭绱濋柅姘辩叀閻樿埖鈧焦鐖崪灞姐亣缁?
  useEffect(() => {
    const currentActiveTab = getFocusedActiveTab();

    // 閸氬本顒為崗銊ョ湰瑜版挸澧犻弽鍥╊劮娑撳﹣绗呴弬鍥风礉娓?AI 闂堛垺婢樼粵澶婂弿鐏炩偓缂佸嫪娆㈢拠璇插絿
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

    // 闁氨鐓℃径褏缈扮紒鍕閺囧瓨鏌?
    if (currentActiveTab && currentActiveTab.type === 'file') {
      window.dispatchEvent(new CustomEvent('editor:content-changed', {
        detail: {
          content: currentActiveTab.content || '',
          language: currentActiveTab.language || 'plaintext',
          path: currentActiveTab.path
        }
      }));
    } else {
      // 闂堢偞鏋冩禒鑸电垼缁涢箖銆夐敍灞剧缁屽搫銇囩痪?
      window.dispatchEvent(new CustomEvent('editor:content-changed', {
        detail: {
          content: '',
          language: 'plaintext',
          path: ''
        }
      }));
    }
  }, [activeTabId, tabs, rightActiveTabId, rightTabs, leftBottomActiveTabId, leftBottomTabs, rightBottomActiveTabId, rightBottomTabs, focusedPaneId, getFocusedActiveTab]);

  // 閻╂垵鎯夋穱婵嗙摠娴滃娆?
  useEffect(() => {
    const handleSaveFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const focusedTab = getFocusedActiveTab();
      const targetTabId = customEvent.detail?.tabId || focusedTab?.id || activeTabId;
      
      if (!targetTabId) {
        return;
      }

      // 閺屻儲澹樼憰浣风箽鐎涙娈戦弽鍥╊劮妞?
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

  // 閻╂垵鎯夐崗鎶芥４閺傚洣娆㈡禍瀣╂
  useEffect(() => {
    const handleCloseFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      const { path } = customEvent.detail;
      
      // 閺屻儲澹樼€电懓绨查惃鍕垼缁涢箖銆夐獮璺哄彠闂?
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

  // 鐏忓棔绻氱€涙ê鍤遍弫鐗堟瘹闂囨彃鍩岄崗銊ョ湰閿涘奔绶佃箛顐ｅ祹闁款喕濞囬悽?
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
    // 榛樿绛夊垎锛氭湭鎷栧姩涓诲垎闅旂嚎鏃讹紝宸︿晶涔熷弬涓庡钩鍧囧垎閰嶅搴︺€?
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

  const getCodeMirrorContent = (tab: EditorTab): string => {
    const rawContent = tab.content || '';
    return isHtmlContent(rawContent) ? htmlToMarkdown(rawContent) : rawContent;
  };

  const renderFileTabEditor = (
    tab: EditorTab,
    isActive: boolean,
    options?: {
      emitImmediateContentChange?: boolean;
      clearDiffPreview?: boolean;
    },
  ): React.ReactNode => {
    if (isFileTabPendingContent(tab)) {
      return (
        <div className="editor-area-loading">
          <div className="editor-area-loading-label">正在加载文件内容...</div>
        </div>
      );
    }

    const { emitImmediateContentChange = false, clearDiffPreview = false } = options ?? {};

    return (
      <CodeMirrorEditor
        content={getCodeMirrorContent(tab)}
        onChange={(markdownContent) => {
          updateTabInAllPanes(tab.id, current => ({
            ...current,
            content: markdownContent,
            isDirty: true,
            isPreview: false,
            isContentLoading: false,
            ...(clearDiffPreview ? { diffPreview: undefined } : {}),
          }));

          if (emitImmediateContentChange && isActive) {
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
        isActive={isActive}
        tabId={tab.id}
        title={tab.title}
        filePath={tab.path}
        language={tab.language}
      />
    );
  };

  return (
    <div className={`editor-area ${draggingTab ? 'is-tab-dragging' : ''} ${className}`}>
      {/* 缂傛牞绶崳銊х矋鐎圭懓娅?- 閺€顖涘瘮閸掑棗鐫?*/}
      <div className="editor-area-groups" ref={editorGroupsRef}>
        {/* 瀹革缚鏅剁紓鏍帆閸ｃ劎绮?*/}
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
          {/* 瀹革缚鏅堕弽鍥╊劮閺?- 婵绮撻弰鍓с仛閿涘苯宓嗘担鎸庣梾閺堝鐖ｇ粵?*/}
          {tabs.length > 0 ? (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
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
              showSplitEditorAction={!isEditorOnlyWindow}
            />
          ) : (
            <div className="tab-bar-placeholder" />
          )}

          {/* 瀹革缚鏅堕棃銏犲瘶鐏?*/}
          {activeTab && activeTab.type !== 'settings' && activeTab.type !== 'markdown-preview' && activeTab.type !== 'knowledge' && activeTab.type !== 'ai-config' && activeTab.type !== 'lancedb-view' && activeTab.type !== 'decomposition-rules' && activeTab.type !== 'prompt-management' && activeTab.type !== 'ai-chat' && activeTab.type !== 'terminal' && activeTab.type !== 'plugin-view' && (
            <Breadcrumb path={activeTab.path} />
          )}

          {/* 瀹革缚鏅剁紓鏍帆閸ｃ劌鍞寸€?*/}
          <div className="editor-area-content">
            {renderDropIndicator('left-top')}
            {/* 缁岃櫣濮搁幀?*/}
            {!activeTab && (
              <div className="editor-area-empty">
                <div className="editor-area-empty-content">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="title">濞屸剝婀侀幍鎾崇磻閻ㄥ嫮绱潏鎴濇珤</p>
                  <p className="subtitle">浠庢枃浠舵祻瑙堝櫒鎵撳紑鏂囦欢寮€濮嬬紪杈?</p>
                </div>
              </div>
            )}

            {/* 濞撳弶鐓嬮幍鈧張澶嬬垼缁涢箖銆夐敍宀勨偓姘崇箖 display 閹貉冨煑閸欘垵顫嗛幀褝绱濋柆鍨帳闁插秵鏌婇崝鐘烘祰 */}
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              
              return (
                <div 
                  key={tab.id} 
                  className="editor-tab-content"
                  style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                >
                  {tab.type === 'settings' && <SettingsView />}
                  
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

                  {tab.type === 'extension' && <ExtensionView extensionPath={tab.path} />}

                  {tab.type === 'plugin-view' && tab.pluginViewData && (
                    <PluginRuntimeView
                      leafId={tab.pluginViewData.leafId}
                      title={tab.title}
                      viewType={tab.pluginViewData.viewType}
                      sourcePath={tab.pluginViewData.sourcePath}
                      html={tab.pluginViewData.html}
                    />
                  )}

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
                        // 閸︺劎绱潏鎴濇珤娑擃厽澧﹀鈧弬鍥︽
                        if (item.type === 'file' && item.path) {
                          try {
                            // 鐠囪褰囬弬鍥︽閸愬懎顔?
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
                            console.error('[EditorArea] 鐠囪褰囬弬鍥︽婢惰精瑙?', error);
                          }
                        }
                      }}
                      onFileDelete={(item) => {
                        // 鐟欙箑褰傞崚鐘绘珟娴滃娆?
                        window.dispatchEvent(new CustomEvent('delete-knowledge-item', {
                          detail: { itemId: item.id }
                        }));
                      }}
                    />
                  )}
                  
                  {tab.type === 'file' && (
                    renderFileTabEditor(tab, tab.id === activeTabId, { emitImmediateContentChange: true })
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
                    showSplitEditorAction={!isEditorOnlyWindow}
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
                        <p className="title">娌℃湁鎵撳紑鐨勭紪杈戝櫒</p>
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

                        {tab.type === 'plugin-view' && tab.pluginViewData && (
                          <PluginRuntimeView
                            leafId={tab.pluginViewData.leafId}
                            title={tab.title}
                            viewType={tab.pluginViewData.viewType}
                            sourcePath={tab.pluginViewData.sourcePath}
                            html={tab.pluginViewData.html}
                          />
                        )}

                        {tab.type === 'file' && (
                          renderFileTabEditor(tab, isActive)
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 閸欘垵鐨熼弫鏉戙亣鐏忓繒娈戦崚鍡涙閺?*/}
        {isSplitView && (
          <ResizableDivider
            onResize={handleResizeMainSplit}
            orientation="horizontal"
            minPrimarySize={300}
            minSecondarySize={300}
          />
        )}

        {/* 閸欏厖鏅剁紓鏍帆閸ｃ劎绮?*/}
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
                    onTabClick={() => handleExtraRightPaneTabClick(sourceLocated.paneId, sourceTab.id)}
                    onTabClose={() => closeExtraRightSplitPane(pane.id)}
                    onSplitToDirection={(_, direction) => handleExtraRightPaneSplitToDirection(sourceTab.id, direction)}
                    onMoveToDirection={(_, direction) => handleExtraRightPaneMoveToDirection(sourceTab.id, direction)}
                    onAddTabToChat={() => addTabToChatContext(sourceTab.id)}
                    onOpenTabInExplorer={() => openTabInSystemExplorer(sourceTab.id)}
                    onRevealTabInExplorerView={() => revealTabInExplorerView(sourceTab.id)}
                    onCloseMultipleTabs={() => closeExtraRightSplitPane(pane.id)}
                    onOpenInNewWindow={() => handleOpenTabInNewWindow(sourceTab.id)}
                    showSplitEditorAction={!isEditorOnlyWindow}
                  />

                  <Breadcrumb path={sourceTab.path} />

                  <div className="editor-area-content">
                    {renderFileTabEditor(sourceTab, true)}
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
            {/* 閸欏厖鏅堕弽鍥╊劮閺?*/}
            {rightTabs.length > 0 && (
              <TabBar
                tabs={rightTabs}
                activeTabId={rightActiveTabId}
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
                showSplitEditorAction={!isEditorOnlyWindow}
              />
            )}

            {/* 閸欏厖鏅堕棃銏犲瘶鐏?*/}
            {rightActiveTab && rightActiveTab.type !== 'settings' && rightActiveTab.type !== 'markdown-preview' && rightActiveTab.type !== 'knowledge' && rightActiveTab.type !== 'ai-config' && rightActiveTab.type !== 'lancedb-view' && rightActiveTab.type !== 'decomposition-rules' && rightActiveTab.type !== 'prompt-management' && rightActiveTab.type !== 'ai-chat' && rightActiveTab.type !== 'terminal' && rightActiveTab.type !== 'plugin-view' && (
              <Breadcrumb path={rightActiveTab.path} />
            )}

            {/* 閸欏厖鏅剁紓鏍帆閸ｃ劌鍞寸€?*/}
            <div className="editor-area-content">
              {renderDropIndicator('right-top')}
              {/* 濞撳弶鐓嬮幍鈧張澶婂礁娓氀勭垼缁涢箖銆夐敍宀勨偓姘崇箖 display 閹貉冨煑閸欘垵顫嗛幀褝绱濋柆鍨帳闁插秵鏌婇崝鐘烘祰 */}
              {rightTabs.map((tab) => {
                const isActive = tab.id === rightActiveTabId;
                
                return (
                  <div 
                    key={tab.id} 
                    className="editor-tab-content"
                    style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                  >
                    {tab.type === 'settings' && <SettingsView />}
                    
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

                    {tab.type === 'extension' && <ExtensionView extensionPath={tab.path} />}

                    {tab.type === 'plugin-view' && tab.pluginViewData && (
                      <PluginRuntimeView
                        leafId={tab.pluginViewData.leafId}
                        title={tab.title}
                        viewType={tab.pluginViewData.viewType}
                        sourcePath={tab.pluginViewData.sourcePath}
                        html={tab.pluginViewData.html}
                      />
                    )}

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
                              console.error('[EditorArea] 鐠囪褰囬弬鍥︽婢惰精瑙?', error);
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
                      renderFileTabEditor(tab, isActive, { clearDiffPreview: true })
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
                      showSplitEditorAction={!isEditorOnlyWindow}
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
                          <p className="title">娌℃湁鎵撳紑鐨勭紪杈戝櫒</p>
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

                          {tab.type === 'plugin-view' && tab.pluginViewData && (
                            <PluginRuntimeView
                              leafId={tab.pluginViewData.leafId}
                              title={tab.title}
                              viewType={tab.pluginViewData.viewType}
                              sourcePath={tab.pluginViewData.sourcePath}
                              html={tab.pluginViewData.html}
                            />
                          )}

                          {tab.type === 'file' && (
                            renderFileTabEditor(tab, isActive, { clearDiffPreview: true })
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
