/**
 * 右侧边栏状态管理
 * 使用 Zustand 管理右侧边栏的全局状态
 */

import { create } from 'zustand';

export type RightSidebarView = 'important-files' | 'tags' | 'backlinks' | 'outline' | 'annotations' | 'links' | 'templates' | 'daily-note';

interface RightSidebarStore {
  isVisible: boolean;
  activeView: RightSidebarView | null;
  width: number;
  isActivityBarVisible: boolean;
  setVisible: (visible: boolean) => void;
  setActiveView: (view: RightSidebarView | null) => void;
  setWidth: (width: number) => void;
  setActivityBarVisible: (visible: boolean) => void;
  toggleActivityBar: () => void;
  toggle: (view?: RightSidebarView) => void;
}

export const useRightSidebarStore = create<RightSidebarStore>((set, get) => ({
  isVisible: false,
  activeView: null,
  width: 320,
  isActivityBarVisible: true,

  setVisible: (visible: boolean) => {
    console.log('[rightSidebarStore] setVisible:', visible);
    set({ isVisible: visible });
  },

  setActiveView: (view: RightSidebarView | null) => {
    console.log('[rightSidebarStore] setActiveView:', view);
    set({ activeView: view });
  },

  setWidth: (width: number) => {
    set({ width });
  },

  setActivityBarVisible: (visible: boolean) => {
    set({ isActivityBarVisible: visible });
  },

  toggleActivityBar: () => {
    const { isActivityBarVisible } = get();
    set({ isActivityBarVisible: !isActivityBarVisible });
  },

  toggle: (view?: RightSidebarView) => {
    const { isVisible, activeView } = get();
    console.log('[rightSidebarStore] toggle 调用:', { view, currentIsVisible: isVisible, currentActiveView: activeView });

    if (!view) {
      set({ isVisible: !isVisible });
      return;
    }

    if (activeView === view && isVisible) {
      console.log('[rightSidebarStore] 关闭边栏');
      set({ isVisible: false });
    } else {
      console.log('[rightSidebarStore] 打开边栏:', view);
      set({ activeView: view, isVisible: true });
    }
  }
}));
