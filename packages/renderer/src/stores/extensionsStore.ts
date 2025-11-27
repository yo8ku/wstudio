/**
 * 扩展中心状态管理
 * 功能：维护已下载扩展标签页的分类与搜索状态
 */

import { create } from 'zustand';

export type DownloadedCategory =
  | 'all'
  | 'themes'
  | 'plugins'
  | 'icons'
  | 'templates'
  | 'widgets';

interface ExtensionsStore {
  downloadedCategory: DownloadedCategory;
  searchQuery: string;
  setDownloadedCategory: (category: DownloadedCategory) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

export const useExtensionsStore = create<ExtensionsStore>((set) => ({
  downloadedCategory: 'all',
  searchQuery: '',
  setDownloadedCategory: (category) => set({ downloadedCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  resetFilters: () => set({ downloadedCategory: 'all', searchQuery: '' }),
}));

