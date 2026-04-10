import { create } from 'zustand';

export interface PluginRuntimeMenuRendererItem {
  readonly id: string;
  readonly title: string;
  readonly icon: string | null;
  readonly checked: boolean | null;
  readonly disabled: boolean;
  readonly warning: boolean;
  readonly label: boolean;
  readonly section: string;
  readonly separator: boolean;
}

export interface PluginRuntimeMenuRendererPayload {
  readonly menuId: string;
  readonly items: readonly PluginRuntimeMenuRendererItem[];
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly overlap?: boolean;
    readonly left?: boolean;
  } | null;
  readonly noIcon: boolean;
  readonly useNativeMenu: boolean;
}

interface PluginMenuStore {
  readonly isOpen: boolean;
  readonly menuId: string | null;
  readonly items: readonly PluginRuntimeMenuRendererItem[];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly noIcon: boolean;
  openMenu: (payload: PluginRuntimeMenuRendererPayload) => void;
  closeMenu: () => void;
  closeMenuById: (menuId: string) => void;
}

const DEFAULT_POSITION = {
  x: 96,
  y: 96,
} as const;

export const usePluginMenuStore = create<PluginMenuStore>((set, get) => ({
  isOpen: false,
  menuId: null,
  items: [],
  position: DEFAULT_POSITION,
  noIcon: false,
  openMenu: (payload): void => {
    set({
      isOpen: true,
      menuId: payload.menuId,
      items: payload.items,
      position: payload.position === null
        ? DEFAULT_POSITION
        : {
            x: payload.position.x,
            y: payload.position.y,
          },
      noIcon: payload.noIcon,
    });
  },
  closeMenu: (): void => {
    set({
      isOpen: false,
      menuId: null,
      items: [],
      position: DEFAULT_POSITION,
      noIcon: false,
    });
  },
  closeMenuById: (menuId): void => {
    if (get().menuId !== menuId) {
      return;
    }

    get().closeMenu();
  },
}));
