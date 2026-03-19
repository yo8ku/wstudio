/**
 * Workbench 菜单命令执行时传递给插件命令的上下文类型。
 */

import type { JsonObject } from './json';

export interface WorkbenchTextRange extends JsonObject {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface WorkbenchSidebarTitleMenuContext extends JsonObject {
  readonly kind: 'sidebar/title';
  readonly activeView: string;
  readonly title: string;
  readonly containerId: string | null;
  readonly containerKey: string | null;
  readonly containerExtensionId: string | null;
}

export interface WorkbenchNoteMenuContext extends JsonObject {
  readonly kind: 'note/context';
  readonly tabId: string;
  readonly tabType: string;
  readonly title: string;
  readonly path: string | null;
  readonly language: string | null;
  readonly isDirty: boolean;
  readonly isPreview: boolean;
  readonly workspaceRelativePath: string | null;
}

export interface WorkbenchEditorMenuContext extends JsonObject {
  readonly kind: 'editor/context';
  readonly tabId: string | null;
  readonly title: string | null;
  readonly path: string | null;
  readonly language: string | null;
  readonly selectionText: string;
  readonly hasSelection: boolean;
  readonly selectionRange: WorkbenchTextRange | null;
}

export type WorkbenchMenuContext =
  | WorkbenchSidebarTitleMenuContext
  | WorkbenchNoteMenuContext
  | WorkbenchEditorMenuContext;
