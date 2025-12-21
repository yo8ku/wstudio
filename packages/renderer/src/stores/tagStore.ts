/**
 * tagStore.ts
 * 标签状态管理
 * 功能：使用 Zustand 管理标签的全局 UI 状态
 */

import { create } from 'zustand';
import { TagItem, NoteItem } from '../types/electron';

interface TagCloudItem {
  tag: TagItem;
  weight: number;
}

interface TagState {
  /** 所有标签列表 */
  tags: TagItem[];
  /** 当前选中的标签 */
  selectedTag: TagItem | null;
  /** 标签云数据 */
  tagCloud: TagCloudItem[];
  /** 选中标签的笔记列表 */
  notesByTag: NoteItem[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // Actions
  /** 设置标签列表 */
  setTags: (tags: TagItem[]) => void;
  /** 设置选中的标签 */
  setSelectedTag: (tag: TagItem | null) => void;
  /** 设置标签云数据 */
  setTagCloud: (tagCloud: TagCloudItem[]) => void;
  /** 设置选中标签的笔记列表 */
  setNotesByTag: (notes: NoteItem[]) => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 添加标签到列表 */
  addTag: (tag: TagItem) => void;
  /** 更新列表中的标签 */
  updateTagInList: (id: string, updates: Partial<TagItem>) => void;
  /** 从列表中删除标签 */
  removeTagFromList: (id: string) => void;
  /** 清空状态 */
  reset: () => void;

  // Async Actions (调用 IPC)
  /** 加载所有标签 */
  loadTags: () => Promise<void>;
  /** 创建标签 */
  createTag: (name: string, parentId?: string) => Promise<TagItem | null>;
  /** 更新标签 */
  updateTag: (id: string, name: string) => Promise<boolean>;
  /** 删除标签 */
  deleteTag: (id: string) => Promise<boolean>;
  /** 选择标签并加载相关笔记 */
  selectTag: (tag: TagItem | null) => Promise<void>;
  /** 根据标签获取笔记 */
  getNotesByTag: (tagId: string) => Promise<NoteItem[]>;
}

/**
 * 计算标签云权重
 */
function calculateTagCloud(tags: TagItem[]): TagCloudItem[] {
  if (tags.length === 0) return [];

  const maxCount = Math.max(...tags.map(t => t.noteCount), 1);
  const minCount = Math.min(...tags.map(t => t.noteCount), 0);
  const range = maxCount - minCount || 1;

  return tags.map(tag => ({
    tag,
    // 权重范围 1-5
    weight: Math.ceil(((tag.noteCount - minCount) / range) * 4) + 1
  }));
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  selectedTag: null,
  tagCloud: [],
  notesByTag: [],
  isLoading: false,
  error: null,

  setTags: (tags) => {
    set({ tags, tagCloud: calculateTagCloud(tags) });
  },
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setTagCloud: (tagCloud) => set({ tagCloud }),
  setNotesByTag: (notes) => set({ notesByTag: notes }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  addTag: (tag) => {
    const { tags } = get();
    const newTags = [...tags, tag];
    set({ tags: newTags, tagCloud: calculateTagCloud(newTags) });
  },

  updateTagInList: (id, updates) => {
    const { tags, selectedTag } = get();
    const updatedTags = tags.map(tag =>
      tag.id === id ? { ...tag, ...updates } : tag
    );
    set({ tags: updatedTags, tagCloud: calculateTagCloud(updatedTags) });

    // 如果更新的是当前选中的标签，也更新 selectedTag
    if (selectedTag?.id === id) {
      set({ selectedTag: { ...selectedTag, ...updates } });
    }
  },

  removeTagFromList: (id) => {
    const { tags, selectedTag } = get();
    const newTags = tags.filter(tag => tag.id !== id);
    set({ tags: newTags, tagCloud: calculateTagCloud(newTags) });

    // 如果删除的是当前选中的标签，清空 selectedTag
    if (selectedTag?.id === id) {
      set({ selectedTag: null, notesByTag: [] });
    }
  },

  reset: () => set({
    tags: [],
    selectedTag: null,
    tagCloud: [],
    notesByTag: [],
    isLoading: false,
    error: null
  }),

  // Async Actions
  loadTags: async () => {
    set({ isLoading: true, error: null });
    try {
      const tags = await window.electron?.ipcRenderer.invoke('tag:getAll');
      const tagList = tags || [];
      set({
        tags: tagList,
        tagCloud: calculateTagCloud(tagList),
        isLoading: false
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载标签失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[tagStore] 加载标签失败:', error);
    }
  },

  createTag: async (name, parentId) => {
    set({ isLoading: true, error: null });
    try {
      const tag = await window.electron?.ipcRenderer.invoke('tag:create', name, parentId);
      if (tag) {
        get().addTag(tag);
        set({ isLoading: false });
        return tag;
      }
      set({ isLoading: false });
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建标签失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[tagStore] 创建标签失败:', error);
      return null;
    }
  },

  updateTag: async (id, name) => {
    try {
      const success = await window.electron?.ipcRenderer.invoke('tag:update', id, name);
      if (success) {
        get().updateTagInList(id, { name });
      }
      return success || false;
    } catch (error) {
      console.error('[tagStore] 更新标签失败:', error);
      return false;
    }
  },

  deleteTag: async (id) => {
    try {
      const success = await window.electron?.ipcRenderer.invoke('tag:delete', id);
      if (success) {
        get().removeTagFromList(id);
      }
      return success || false;
    } catch (error) {
      console.error('[tagStore] 删除标签失败:', error);
      return false;
    }
  },

  selectTag: async (tag) => {
    set({ selectedTag: tag });
    if (tag) {
      const notes = await get().getNotesByTag(tag.id);
      set({ notesByTag: notes });
    } else {
      set({ notesByTag: [] });
    }
  },

  getNotesByTag: async (tagId) => {
    try {
      const notes = await window.electron?.ipcRenderer.invoke('tag:getNotesByTag', tagId);
      return notes || [];
    } catch (error) {
      console.error('[tagStore] 获取标签笔记失败:', error);
      return [];
    }
  }
}));
