/**
 * noteStore.ts
 * 笔记状态管理
 * 功能：使用 Zustand 管理笔记的全局 UI 状态
 */

import { create } from 'zustand';
import { NoteItem, NoteType } from '../types/electron';

interface NoteState {
  /** 所有笔记列表 */
  notes: NoteItem[];
  /** 当前选中的笔记 */
  currentNote: NoteItem | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 搜索关键词 */
  searchQuery: string;
  /** 搜索结果 */
  searchResults: NoteItem[];

  // Actions
  /** 设置笔记列表 */
  setNotes: (notes: NoteItem[]) => void;
  /** 设置当前笔记 */
  setCurrentNote: (note: NoteItem | null) => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void;
  /** 设置搜索结果 */
  setSearchResults: (results: NoteItem[]) => void;
  /** 添加笔记到列表 */
  addNote: (note: NoteItem) => void;
  /** 更新列表中的笔记 */
  updateNoteInList: (id: string, updates: Partial<NoteItem>) => void;
  /** 从列表中删除笔记 */
  removeNoteFromList: (id: string) => void;
  /** 清空状态 */
  reset: () => void;

  // Async Actions (调用 IPC)
  /** 加载所有笔记 */
  loadNotes: () => Promise<void>;
  /** 创建笔记 */
  createNote: (type?: NoteType) => Promise<NoteItem | null>;
  /** 更新笔记 */
  updateNote: (id: string, updates: Partial<NoteItem>) => Promise<boolean>;
  /** 删除笔记 */
  deleteNote: (id: string) => Promise<boolean>;
  /** 搜索笔记 */
  searchNotes: (query: string) => Promise<void>;
  /** 获取每日笔记 */
  getDailyNote: (date: string) => Promise<NoteItem | null>;
  /** 创建每日笔记 */
  createDailyNote: (date: string) => Promise<NoteItem | null>;
  /** 切换收藏状态 */
  toggleFavorite: (id: string) => Promise<boolean>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  currentNote: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  searchResults: [],

  setNotes: (notes) => set({ notes }),
  setCurrentNote: (note) => set({ currentNote: note }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),

  addNote: (note) => {
    const { notes } = get();
    set({ notes: [note, ...notes] });
  },

  updateNoteInList: (id, updates) => {
    const { notes, currentNote } = get();
    const updatedNotes = notes.map(note =>
      note.id === id ? { ...note, ...updates } : note
    );
    set({ notes: updatedNotes });

    // 如果更新的是当前笔记，也更新 currentNote
    if (currentNote?.id === id) {
      set({ currentNote: { ...currentNote, ...updates } });
    }
  },

  removeNoteFromList: (id) => {
    const { notes, currentNote } = get();
    set({ notes: notes.filter(note => note.id !== id) });

    // 如果删除的是当前笔记，清空 currentNote
    if (currentNote?.id === id) {
      set({ currentNote: null });
    }
  },

  reset: () => set({
    notes: [],
    currentNote: null,
    isLoading: false,
    error: null,
    searchQuery: '',
    searchResults: []
  }),

  // Async Actions
  loadNotes: async () => {
    set({ isLoading: true, error: null });
    try {
      const notes = await window.electron?.ipcRenderer.invoke('note:getAll');
      set({ notes: notes || [], isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载笔记失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[noteStore] 加载笔记失败:', error);
    }
  },

  createNote: async (type = 'normal') => {
    set({ isLoading: true, error: null });
    try {
      const note = await window.electron?.ipcRenderer.invoke('note:create', { type });
      if (note) {
        get().addNote(note);
        set({ currentNote: note, isLoading: false });
        return note;
      }
      set({ isLoading: false });
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建笔记失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[noteStore] 创建笔记失败:', error);
      return null;
    }
  },

  updateNote: async (id, updates) => {
    try {
      const success = await window.electron?.ipcRenderer.invoke('note:update', id, updates);
      if (success) {
        get().updateNoteInList(id, { ...updates, updatedAt: Date.now() });
      }
      return success || false;
    } catch (error) {
      console.error('[noteStore] 更新笔记失败:', error);
      return false;
    }
  },

  deleteNote: async (id) => {
    try {
      const success = await window.electron?.ipcRenderer.invoke('note:delete', id);
      if (success) {
        get().removeNoteFromList(id);
      }
      return success || false;
    } catch (error) {
      console.error('[noteStore] 删除笔记失败:', error);
      return false;
    }
  },

  searchNotes: async (query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }

    try {
      const results = await window.electron?.ipcRenderer.invoke('note:search', query);
      set({ searchResults: results || [] });
    } catch (error) {
      console.error('[noteStore] 搜索笔记失败:', error);
      set({ searchResults: [] });
    }
  },

  getDailyNote: async (date) => {
    try {
      const note = await window.electron?.ipcRenderer.invoke('note:getDailyNote', date);
      return note || null;
    } catch (error) {
      console.error('[noteStore] 获取每日笔记失败:', error);
      return null;
    }
  },

  createDailyNote: async (date) => {
    set({ isLoading: true, error: null });
    try {
      const note = await window.electron?.ipcRenderer.invoke('note:createDailyNote', date);
      if (note) {
        // 检查是否已存在于列表中
        const { notes } = get();
        const exists = notes.some(n => n.id === note.id);
        if (!exists) {
          get().addNote(note);
        }
        set({ currentNote: note, isLoading: false });
        return note;
      }
      set({ isLoading: false });
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建每日笔记失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[noteStore] 创建每日笔记失败:', error);
      return null;
    }
  },

  toggleFavorite: async (id) => {
    try {
      const newStatus = await window.electron?.ipcRenderer.invoke('note:toggleFavorite', id);
      if (typeof newStatus === 'boolean') {
        get().updateNoteInList(id, { isFavorite: newStatus });
      }
      return newStatus || false;
    } catch (error) {
      console.error('[noteStore] 切换收藏状态失败:', error);
      return false;
    }
  }
}));
