/**
 * 活动栏状态管理
 * 功能：管理活动栏中各项的可见性和侧栏位置
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ActivityBarVisibility {
  explorer: boolean;
  search: boolean;
  sourceControl: boolean;
  extensions: boolean;
  knowledgeBase: boolean;
  aiModel: boolean;
}

export type SidebarPosition = 'left' | 'right';

interface ActivityBarStore {
  // 各项的可见性状态
  visibility: ActivityBarVisibility;
  // 侧栏位置
  sidebarPosition: SidebarPosition;
  // 切换单个项的可见性
  toggleVisibility: (item: keyof ActivityBarVisibility) => void;
  // 设置单个项的可见性
  setVisibility: (item: keyof ActivityBarVisibility, visible: boolean) => void;
  // 设置侧栏位置
  setSidebarPosition: (position: SidebarPosition) => void;
  // 切换侧栏位置
  toggleSidebarPosition: () => void;
}

export const useActivityBarStore = create<ActivityBarStore>()(
  persist(
    (set, get) => ({
      // 默认全部可见
      visibility: {
        explorer: true,
        search: true,
        sourceControl: true,
        extensions: true,
        knowledgeBase: true,
        aiModel: true,
      },
      sidebarPosition: 'left',
      
      toggleVisibility: (item) => {
        const { visibility } = get();
        set({
          visibility: {
            ...visibility,
            [item]: !visibility[item],
          },
        });
      },
      
      setVisibility: (item, visible) => {
        const { visibility } = get();
        set({
          visibility: {
            ...visibility,
            [item]: visible,
          },
        });
      },
      
      setSidebarPosition: (position) => {
        set({ sidebarPosition: position });
      },
      
      toggleSidebarPosition: () => {
        const { sidebarPosition } = get();
        set({ sidebarPosition: sidebarPosition === 'left' ? 'right' : 'left' });
      },
    }),
    {
      name: 'activity-bar-storage',
    }
  )
);

