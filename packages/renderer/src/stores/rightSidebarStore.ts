/**
 * 右侧边栏状态管 * 使用 Zustand 管理右侧边栏的全局状态 */

import { create } from 'zustand';

export type RightSidebarView = 'important-files' | 'tags' | 'backlinks' | 'outline' | 'annotations' | 'links' | 'templates' | 'daily-note';

interface RightSidebarStore {
  isVisible: boolean;
  activeView: RightSidebarView | null;
  width: number;
  isActivityBarVisible: boolean; // 控制右侧活动栏的显示/隐藏
  setVisible: (visible: boolean) => void;
  setActiveView: (view: RightSidebarView | null) => void;
  setWidth: (width: number) => void;
  setActivityBarVisible: (visible: boolean) => void;
  toggleActivityBar: () => void; // 切换活动栏显示状态
  toggle: (view?: RightSidebarView) => void;
}

export const useRightSidebarStore = create<RightSidebarStore>((set, get) => ({
  isVisible: false,
  activeView: null,
  width: 320,
  isActivityBarVisible: false, // 默认隐藏右侧活动  
  setVisible: (visible) => set({ isVisible: visible }),
  
  setActiveView: (view) => set({ activeView: view }),
  
  setWidth: (width) => set({ width }),
  
  setActivityBarVisible: (visible) => set({ isActivityBarVisible: visible }),
  
  toggleActivityBar: () => {
    const { isActivityBarVisible } = get();
    set({ isActivityBarVisible: !isActivityBarVisible });
  },
  
  toggle: (view) => {
    const { isVisible, activeView } = get();
    
    if (!view) {
      // 如果没有指定视图，只切换可见      set({ isVisible: !isVisible });
      return;
    }
    
    if (activeView === view && isVisible) {
      // 如果点击当前激活的视图，隐藏边      set({ isVisible: false });
    } else {
      // 切换到新视图并显示      set({ activeView: view, isVisible: true });
    }
  }
}));

