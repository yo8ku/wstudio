/**
 * Detached bookmark group picker contracts.
 * Defines the request and response shapes used by the bookmark group picker popup window.
 */

import type { BookmarkGroupItem } from '../components/Explorer/Bookmark/types';

export interface BookmarkGroupPickerAnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BookmarkGroupPickerThemeVariables {
  [variableName: string]: string;
}

export type BookmarkGroupPickerBackgroundEffect = 'none' | 'system-acrylic';

export interface BookmarkGroupPickerRequest {
  anchorRect: BookmarkGroupPickerAnchorRect;
  selectedGroupId: string | null;
  groups: BookmarkGroupItem[];
  ungroupedLabel: string;
  themeVariables: BookmarkGroupPickerThemeVariables;
  hasWorkbenchBackgroundImage: boolean;
  minWidth?: number;
  maxHeight?: number;
}

export interface BookmarkGroupPickerState extends BookmarkGroupPickerRequest {
  backgroundEffect: BookmarkGroupPickerBackgroundEffect;
}

export interface BookmarkGroupPickerResult {
  status: 'selected' | 'cancelled';
  groupId: string | null;
}

export interface BookmarkGroupPickerActionResult {
  success: boolean;
}
