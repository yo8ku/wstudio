/**
 * Activity bar visibility state.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ActivityBarVisibility {
  explorer: boolean;
  search: boolean;
  extensions: boolean;
  knowledgeBase: boolean;
  aiModel: boolean;
  media: boolean;
}

export type SidebarPosition = 'left' | 'right';

interface ActivityBarStore {
  visibility: ActivityBarVisibility;
  sidebarPosition: SidebarPosition;
  toggleVisibility: (item: keyof ActivityBarVisibility) => void;
  setVisibility: (item: keyof ActivityBarVisibility, visible: boolean) => void;
  setSidebarPosition: (position: SidebarPosition) => void;
  toggleSidebarPosition: () => void;
}

export const useActivityBarStore = create<ActivityBarStore>()(
  persist(
    (set, get) => ({
      visibility: {
        explorer: true,
        search: true,
        extensions: true,
        knowledgeBase: true,
        aiModel: true,
        media: true,
      },
      sidebarPosition: 'left',
      toggleVisibility: item => {
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
      setSidebarPosition: position => {
        set({ sidebarPosition: position });
      },
      toggleSidebarPosition: () => {
        const { sidebarPosition } = get();
        set({ sidebarPosition: sidebarPosition === 'left' ? 'right' : 'left' });
      },
    }),
    {
      name: 'activity-bar-storage',
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ActivityBarStore> | undefined;
        return {
          ...currentState,
          ...persisted,
          visibility: {
            ...currentState.visibility,
            ...(persisted?.visibility || {}),
          },
        };
      },
    },
  ),
);
