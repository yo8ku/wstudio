/**
 * linkStore.ts
 * 链接状态管理
 * 功能：使用 Zustand 管理双向链接的全局 UI 状态
 */

import { create } from 'zustand';
import { LinkItem } from '../types/electron';

interface UnlinkedMention {
  noteId: string;
  noteTitle: string;
  context: string;
}

interface LinkState {
  /** 当前笔记的出链 */
  outlinks: LinkItem[];
  /** 当前笔记的反向链接 */
  backlinks: LinkItem[];
  /** 未链接提及 */
  unlinkedMentions: UnlinkedMention[];
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
  setUnlinkedMentions: (mentions: UnlinkedMention[]) => void;
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
  findUnlinkedMentions: (noteTitle: string) => Promise<void>;
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

  findUnlinkedMentions: async (noteTitle) => {
    try {
      // 获取所有笔记
      const notes = await window.electron?.ipcRenderer.invoke('note:getAll');
      if (!notes) {
        set({ unlinkedMentions: [] });
        return;
      }

      // 在前端查找未链接提及
      const mentions: UnlinkedMention[] = [];
      const titleLower = noteTitle.toLowerCase();

      for (const note of notes) {
        if (note.title === noteTitle) continue;

        const contentLower = note.content.toLowerCase();
        if (contentLower.includes(titleLower)) {
          // 检查是否已经是链接
          const linkPattern = new RegExp(`\\[\\[${noteTitle}\\]\\]`, 'i');
          if (!linkPattern.test(note.content)) {
            // 获取上下文
            const index = contentLower.indexOf(titleLower);
            const start = Math.max(0, index - 50);
            const end = Math.min(note.content.length, index + noteTitle.length + 50);
            const context = note.content.slice(start, end);

            mentions.push({
              noteId: note.id,
              noteTitle: note.title,
              context: start > 0 ? '...' + context : context
            });
          }
        }
      }

      set({ unlinkedMentions: mentions });
    } catch (error) {
      console.error('[linkStore] 查找未链接提及失败:', error);
      set({ unlinkedMentions: [] });
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
