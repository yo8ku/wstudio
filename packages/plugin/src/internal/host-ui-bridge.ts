export type PluginRuntimeNoticeLevel = 'success' | 'error' | 'warning' | 'info';

export interface PluginRuntimeNoticePayload {
  readonly message: string;
  readonly level: PluginRuntimeNoticeLevel;
}

export interface PluginRuntimeModalPayload {
  readonly title: string;
  readonly description: string | null;
}

export interface PluginRuntimeSuggestInstructionPayload {
  readonly command: string;
  readonly purpose: string;
}

export interface PluginRuntimeSuggestItemPayload {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
}

export interface PluginRuntimeSuggestModalVisualPayload {
  readonly title: string;
  readonly placeholder: string;
  readonly query: string;
  readonly emptyStateText: string;
  readonly instructions: readonly PluginRuntimeSuggestInstructionPayload[];
  readonly items: readonly PluginRuntimeSuggestItemPayload[];
}

export interface PluginRuntimeMenuItemPayload {
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

export interface PluginRuntimeMenuPositionPayload {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly overlap?: boolean;
  readonly left?: boolean;
}

export interface PluginRuntimeMenuPayload {
  readonly items: readonly PluginRuntimeMenuItemPayload[];
  readonly position: PluginRuntimeMenuPositionPayload | null;
  readonly noIcon: boolean;
  readonly useNativeMenu: boolean;
  readonly onSelect: (itemId: string) => void;
  readonly onHide?: () => void;
}

export interface PluginHostUiBridge {
  showNotice(payload: PluginRuntimeNoticePayload): void;
  openModal(payload: PluginRuntimeModalPayload): void;
  closeModal(): void;
  openSuggestModal(payload: PluginRuntimeSuggestModalVisualPayload & {
    readonly onQueryChange: (query: string) => Promise<void> | void;
    readonly onSelect: (itemId: string) => void;
    readonly onClose?: () => void;
  }): string;
  updateSuggestModal(payload: PluginRuntimeSuggestModalVisualPayload & {
    readonly modalId: string;
  }): void;
  closeSuggestModal(modalId: string): void;
  openMenu(payload: PluginRuntimeMenuPayload): string;
  closeMenu(menuId: string): void;
}

interface PluginHostUiBridgeOwner {
  __wstudioPluginHostUiBridge?: PluginHostUiBridge;
}

export function getPluginHostUiBridge(): PluginHostUiBridge | null {
  const owner = globalThis as typeof globalThis & PluginHostUiBridgeOwner;
  return owner.__wstudioPluginHostUiBridge ?? null;
}
