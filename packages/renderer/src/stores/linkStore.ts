/**
 * linkStore.ts
 * 链接状态管理
 * 功能：使用 Zustand 管理双向链接的全局 UI 状态
 */

import { create } from 'zustand';
import { LinkItem, UnlinkedMentionItem } from '../types/electron';

interface LinkState {
  /** 当前笔记的出链 */
  outlinks: LinkItem[];
  /** 当前笔记的反向链接 */
  backlinks: LinkItem[];
  /** 未链接提及 */
  unlinkedMentions: UnlinkedMentionItem[];
  /** 所有链接 */
  allLinks: LinkItem[];
  /** 当前笔记 ID */
  currentNoteId: string | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // Actions
  /** 设置出链 */
  setOutlinks: (links: LinkItem[]) => void;
  /** 设置反向链接 */
  setBacklinks: (links: LinkItem[]) => void;
  /** 设置未链接提及 */
  setUnlinkedMentions: (mentions: UnlinkedMentionItem[]) => void;
  /** 设置所有链接 */
  setAllLinks: (links: LinkItem[]) => void;
  /** 设置当前笔记 ID */
  setCurrentNoteId: (id: string | null) => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 清空状态 */
  reset: () => void;

  // Async Actions (调用 IPC)
  /** 加载笔记的链接 */
  loadLinks: (noteId: string) => Promise<void>;
  /** 创建链接 */
  createLink: (sourceId: string, targetTitle: string, context?: string) => Promise<LinkItem | null>;
  /** 删除链接 */
  deleteLink: (id: string) => Promise<boolean>;
  /** 查找未链接提及 */
  findUnlinkedMentions: (noteId: string) => Promise<void>;
  /** 将未链接提及转换为链接 */
  convertUnlinkedMention: (
    sourceNoteId: string,
    targetNoteId: string,
    position: { start: number; end: number },
    matchedText?: string
  ) => Promise<boolean>;
  /** 加载所有链接 */
  loadAllLinks: () => Promise<void>;
}

export const useLinkStore = create<LinkState>((set, get) => ({
  outlinks: [],
  backlinks: [],
  unlinkedMentions: [],
  allLinks: [],
  currentNoteId: null,
  isLoading: false,
  error: null,

  setOutlinks: (links) => set({ outlinks: links }),
  setBacklinks: (links) => set({ backlinks: links }),
  setUnlinkedMentions: (mentions) => set({ unlinkedMentions: mentions }),
  setAllLinks: (links) => set({ allLinks: links }),
  setCurrentNoteId: (id) => set({ currentNoteId: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  reset: () => set({
    outlinks: [],
    backlinks: [],
    unlinkedMentions: [],
    allLinks: [],
    currentNoteId: null,
    isLoading: false,
    error: null
  }),

  // Async Actions
  loadLinks: async (noteId) => {
    set({ isLoading: true, error: null, currentNoteId: noteId });
    try {
      const [outlinks, backlinks] = await Promise.all([
        window.electron?.ipcRenderer.invoke('link:getOutlinks', noteId),
        window.electron?.ipcRenderer.invoke('link:getBacklinks', noteId)
      ]);

      set({
        outlinks: outlinks || [],
        backlinks: backlinks || [],
        isLoading: false
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载链接失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[linkStore] 加载链接失败:', error);
    }
  },

  createLink: async (sourceId, targetTitle, context) => {
    try {
      const link = await window.electron?.ipcRenderer.invoke(
        'link:create',
        sourceId,
        targetTitle,
        context
      );

      if (link) {
        // 如果是当前笔记的出链，添加到列表
        const { currentNoteId, outlinks } = get();
        if (currentNoteId === sourceId) {
          set({ outlinks: [...outlinks, link] });
        }
        return link;
      }
      return null;
    } catch (error) {
      console.error('[linkStore] 创建链接失败:', error);
      return null;
    }
  },

  deleteLink: async (id) => {
    try {
      const success = await window.electron?.ipcRenderer.invoke('link:delete', id);
      if (success) {
        const { outlinks, backlinks } = get();
        set({
          outlinks: outlinks.filter(link => link.id !== id),
          backlinks: backlinks.filter(link => link.id !== id)
        });
      }
      return success || false;
    } catch (error) {
      console.error('[linkStore] 删除链接失败:', error);
      return false;
    }
  },

  findUnlinkedMentions: async (noteId) => {
    try {
      const mentions = await window.electron?.ipcRenderer.invoke(
        'link:findUnlinkedMentions',
        noteId
      );
      set({ unlinkedMentions: mentions || [] });
    } catch (error) {
      console.error('[linkStore] 查找未链接提及失败:', error);
      set({ unlinkedMentions: [] });
    }
  },

  convertUnlinkedMention: async (sourceNoteId, targetNoteId, position, matchedText) => {
    try {
      const success = await window.electron?.ipcRenderer.invoke(
        'link:convertUnlinkedMention',
        sourceNoteId,
        targetNoteId,
        position,
        matchedText
      );

      if (success) {
        const { currentNoteId, loadLinks, findUnlinkedMentions } = get();
        if (currentNoteId) {
          await Promise.all([
            loadLinks(currentNoteId),
            findUnlinkedMentions(currentNoteId)
          ]);
        }
      }

      return success || false;
    } catch (error) {
      console.error('[linkStore] 转换未链接提及失败:', error);
      return false;
    }
  },

  loadAllLinks: async () => {
    set({ isLoading: true, error: null });
    try {
      const links = await window.electron?.ipcRenderer.invoke('link:getAllLinks');
      set({ allLinks: links || [], isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载所有链接失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[linkStore] 加载所有链接失败:', error);
    }
  }
}));
