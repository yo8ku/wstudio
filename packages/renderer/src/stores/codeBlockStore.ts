/**
 * 代码块状态管理 Store (Zustand)
 * 功能：管理代码块的 UI 状态，分离 UI 状态与文档状态
 * 描述：存储代码块的名称、语言、主题等 UI 状态，避免在 Widget 内部直接更新文档
 */

import { create } from 'zustand';

/**
 * 单个代码块的 UI 状态
 */
interface CodeBlockUIState {
  /** 代码块名称 */
  name: string;
  /** 编程语言 */
  language: string;
  /** 主题 ID */
  themeId: string | null;
  /** 是否折叠 */
  isCollapsed: boolean;
  /** 是否显示输出面板 */
  showOutput: boolean;
  /** 输出内容 */
  outputContent: string;
  /** 输出是否为错误 */
  outputIsError: boolean;
  /** 输出面板是否被用户关闭 */
  outputIsClosed: boolean;
  /** Monaco 编辑器滚动位置 */
  scrollTop: number;
  /** Monaco 编辑器光标位置 */
  cursorPosition: { lineNumber: number; column: number } | null;
}

/**
 * 待同步到文档的更新
 */
interface PendingDocUpdate {
  blockFrom: number;
  field: 'name' | 'language';
  value: string;
}

/**
 * 代码块 Store 状态接口
 */
interface CodeBlockStoreState {
  /** 代码块 UI 状态，以代码内容哈希为 key */
  blocksByHash: Map<string, CodeBlockUIState>;
  /** 待同步到文档的更新队列 */
  pendingUpdates: PendingDocUpdate[];
  /** 是否正在处理更新 */
  isProcessing: boolean;

  // 操作方法
  /** 生成代码块的唯一标识（基于语言和代码内容） */
  getBlockKey: (language: string, code: string) => string;
  /** 获取或创建代码块状态 */
  getBlockState: (language: string, code: string, defaults?: Partial<CodeBlockUIState>) => CodeBlockUIState;
  /** 更新代码块名称（仅 UI 状态） */
  setBlockName: (language: string, code: string, blockFrom: number, name: string) => void;
  /** 更新代码块语言（仅 UI 状态） */
  setBlockLanguage: (language: string, code: string, newLanguage: string) => void;
  /** 更新代码块主题 */
  setBlockTheme: (language: string, code: string, themeId: string | null) => void;
  /** 更新代码块折叠状态 */
  setBlockCollapsed: (language: string, code: string, isCollapsed: boolean) => void;
  /** 更新代码块滚动位置 */
  setBlockScrollPosition: (language: string, code: string, scrollTop: number, cursorPosition: { lineNumber: number; column: number } | null) => void;
  /** 更新代码块输出 */
  setBlockOutput: (language: string, code: string, content: string, isError: boolean) => void;
  /** 设置输出面板显示状态 */
  setBlockOutputVisible: (language: string, code: string, visible: boolean) => void;
  /** 设置输出面板关闭状态 */
  setBlockOutputClosed: (language: string, code: string, closed: boolean) => void;
  /** 添加待同步的文档更新 */
  addPendingUpdate: (update: PendingDocUpdate) => void;
  /** 获取并清空待同步的更新 */
  consumePendingUpdates: () => PendingDocUpdate[];
  /** 清理指定代码块的状态 */
  removeBlock: (language: string, code: string) => void;
  /** 清理所有代码块状态 */
  clearAll: () => void;
}

/**
 * 默认代码块状态
 */
const defaultBlockState: CodeBlockUIState = {
  name: '',
  language: 'plaintext',
  themeId: null,
  isCollapsed: false,
  showOutput: false,
  outputContent: '',
  outputIsError: false,
  outputIsClosed: false,
  scrollTop: 0,
  cursorPosition: null,
};

/**
 * 代码块 Store
 */
export const useCodeBlockStore = create<CodeBlockStoreState>((set, get) => ({
  blocksByHash: new Map(),
  pendingUpdates: [],
  isProcessing: false,

  getBlockKey: (_language: string, code: string): string => {
    // 只使用代码内容的前100个字符生成唯一标识
    // 不包含语言，因为语言可能会被用户修改
    const codePrefix = code.substring(0, 100);
    return `code:${codePrefix}`;
  },

  getBlockState: (language: string, code: string, defaults?: Partial<CodeBlockUIState>): CodeBlockUIState => {
    const { blocksByHash, getBlockKey } = get();
    const key = getBlockKey(language, code);
    const existing = blocksByHash.get(key);
    if (existing) {
      return existing;
    }
    // 创建新状态
    const newState: CodeBlockUIState = { ...defaultBlockState, ...defaults };
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, newState);
    set({ blocksByHash: newBlocks });
    return newState;
  },

  setBlockName: (language: string, code: string, blockFrom: number, name: string) => {
    const { blocksByHash, addPendingUpdate, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    // 只有当名称真正改变时才更新
    if (state.name === name) return;
    
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, { ...state, name });
    set({ blocksByHash: newBlocks });
    
    // 添加到待同步队列
    addPendingUpdate({ blockFrom, field: 'name', value: name });
  },

  setBlockLanguage: (language: string, code: string, newLanguage: string) => {
    const { blocksByHash, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    if (state.language === newLanguage) return;
    
    const newBlocks = new Map(blocksByHash);
    // key 不变（因为只基于代码内容），只更新语言字段
    newBlocks.set(key, { ...state, language: newLanguage });
    set({ blocksByHash: newBlocks });
  },

  setBlockTheme: (language: string, code: string, themeId: string | null) => {
    const { blocksByHash, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    if (state.themeId === themeId) return;
    
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, { ...state, themeId });
    set({ blocksByHash: newBlocks });
  },

  setBlockCollapsed: (language: string, code: string, isCollapsed: boolean) => {
    const { blocksByHash, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    if (state.isCollapsed === isCollapsed) return;
    
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, { ...state, isCollapsed });
    set({ blocksByHash: newBlocks });
  },

  setBlockScrollPosition: (language: string, code: string, scrollTop: number, cursorPosition: { lineNumber: number; column: number } | null) => {
    const { blocksByHash, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, { ...state, scrollTop, cursorPosition });
    set({ blocksByHash: newBlocks });
  },

  setBlockOutput: (language: string, code: string, content: string, isError: boolean) => {
    const { blocksByHash, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, {
      ...state,
      outputContent: content,
      outputIsError: isError,
      showOutput: true,
      outputIsClosed: false,
    });
    set({ blocksByHash: newBlocks });
  },

  setBlockOutputVisible: (language: string, code: string, visible: boolean) => {
    const { blocksByHash, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    if (state.showOutput === visible) return;
    
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, { ...state, showOutput: visible });
    set({ blocksByHash: newBlocks });
  },

  setBlockOutputClosed: (language: string, code: string, closed: boolean) => {
    const { blocksByHash, getBlockState, getBlockKey } = get();
    const state = getBlockState(language, code);
    const key = getBlockKey(language, code);
    
    if (state.outputIsClosed === closed) return;
    
    const newBlocks = new Map(blocksByHash);
    newBlocks.set(key, { ...state, outputIsClosed: closed, showOutput: !closed });
    set({ blocksByHash: newBlocks });
  },

  addPendingUpdate: (update: PendingDocUpdate) => {
    const { pendingUpdates } = get();
    // 检查是否已有相同的更新，如果有则替换
    const existingIndex = pendingUpdates.findIndex(
      u => u.blockFrom === update.blockFrom && u.field === update.field
    );
    
    const newUpdates = [...pendingUpdates];
    if (existingIndex >= 0) {
      newUpdates[existingIndex] = update;
    } else {
      newUpdates.push(update);
    }
    set({ pendingUpdates: newUpdates });
  },

  consumePendingUpdates: () => {
    const { pendingUpdates } = get();
    set({ pendingUpdates: [] });
    return pendingUpdates;
  },

  removeBlock: (language: string, code: string) => {
    const { blocksByHash, getBlockKey } = get();
    const key = getBlockKey(language, code);
    const newBlocks = new Map(blocksByHash);
    newBlocks.delete(key);
    set({ blocksByHash: newBlocks });
  },

  clearAll: () => {
    set({ blocksByHash: new Map(), pendingUpdates: [] });
  },
}));

/**
 * 将待同步的代码块名称应用到文档内容
 * @param content 原始文档内容
 * @returns 更新后的文档内容
 */
export function applyPendingUpdatesToContent(content: string): string {
  const pendingUpdates = useCodeBlockStore.getState().consumePendingUpdates();
  if (pendingUpdates.length === 0) return content;
  
  const lines = content.split('\n');
  let result = content;
  
  // 按位置从后往前处理，避免位置偏移
  const sortedUpdates = [...pendingUpdates].sort((a, b) => b.blockFrom - a.blockFrom);
  
  for (const update of sortedUpdates) {
    if (update.field !== 'name') continue;
    
    // 找到对应的行
    let currentPos = 0;
    for (let i = 0; i < lines.length; i++) {
      if (currentPos === update.blockFrom || (currentPos < update.blockFrom && currentPos + lines[i].length >= update.blockFrom)) {
        const line = lines[i];
        const match = line.match(/^```(\w*)(\s*\/\/\s*.*)?$/);
        if (match) {
          const lang = match[1] || '';
          const newLine = update.value ? '```' + lang + ' // ' + update.value : '```' + lang;
          if (line !== newLine) {
            lines[i] = newLine;
            result = lines.join('\n');
          }
        }
        break;
      }
      currentPos += lines[i].length + 1; // +1 for newline
    }
  }
  
  return result;
}
