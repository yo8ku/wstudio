import type { PluginRuntimeAnchorRect } from './runtime';
import type { JsonValue } from '../types/json';

export type PluginRuntimeNoticeLevel = 'success' | 'error' | 'warning' | 'info';

export interface PluginRuntimeNoticePayload {
  readonly message: string;
  readonly level: PluginRuntimeNoticeLevel;
  readonly duration?: number;
}

export interface PluginRuntimeModalPayload {
  readonly title: string;
  readonly titleElement: HTMLElement;
  readonly contentElement: HTMLElement;
  readonly surfaceId?: string | null;
  readonly onClose?: () => void;
}

export interface PluginRuntimePopoverPayload {
  readonly title: string;
  readonly contentElement: HTMLElement;
  readonly surfaceId?: string | null;
  readonly runtimeState?: JsonValue | null;
  readonly onRuntimeAction?: (action: JsonValue | null) => void;
  readonly width?: number;
  readonly height?: number;
  readonly anchorRect?: PluginRuntimeAnchorRect | null;
  readonly interactionMode?: 'default' | 'editorSuggest';
  readonly onClose?: () => void;
}

export interface PluginRuntimePopoverUpdatePayload {
  readonly title?: string;
  readonly runtimeState?: JsonValue | null;
  readonly width?: number;
  readonly height?: number;
  readonly anchorRect?: PluginRuntimeAnchorRect | null;
  readonly interactionMode?: 'default' | 'editorSuggest';
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
  openModal(payload: PluginRuntimeModalPayload): string;
  closeModal(modalId: string): void;
  openPopover(payload: PluginRuntimePopoverPayload): string;
  updatePopover(popoverId: string, payload: PluginRuntimePopoverUpdatePayload): void;
  closePopover(popoverId: string): void;
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
