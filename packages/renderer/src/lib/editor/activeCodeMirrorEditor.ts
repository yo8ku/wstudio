/**
 * 活动 CodeMirror 编辑器桥接。
 * 用于在主编辑区收敛唯一可编辑入口后，为命令中心、AI 面板等模块提供最小访问能力。
 */

import type { EditorView } from '@codemirror/view';

export interface ActiveCodeMirrorEditorMeta {
  readonly tabId: string | null;
  readonly title: string | null;
  readonly path: string | null;
  readonly language: string | null;
}

interface ActiveCodeMirrorEditorBridge {
  readonly view: EditorView;
  readonly meta: ActiveCodeMirrorEditorMeta;
}

export interface ActiveCodeMirrorCursorPosition {
  readonly lineNumber: number;
  readonly column: number;
}

const EMPTY_META: ActiveCodeMirrorEditorMeta = {
  tabId: null,
  title: null,
  path: null,
  language: null,
};

let activeBridge: ActiveCodeMirrorEditorBridge | null = null;

export const setActiveCodeMirrorEditor = (
  view: EditorView,
  meta?: Partial<ActiveCodeMirrorEditorMeta>,
): void => {
  activeBridge = {
    view,
    meta: {
      tabId: meta?.tabId ?? null,
      title: meta?.title ?? null,
      path: meta?.path ?? null,
      language: meta?.language ?? null,
    },
  };
};

export const clearActiveCodeMirrorEditor = (view: EditorView): void => {
  if (activeBridge?.view === view) {
    activeBridge = null;
  }
};

export const getActiveCodeMirrorEditorView = (): EditorView | null => activeBridge?.view ?? null;

export const getActiveCodeMirrorEditorMeta = (): ActiveCodeMirrorEditorMeta => (
  activeBridge?.meta ?? EMPTY_META
);

export const getActiveCodeMirrorEditorContent = (): string => {
  const view = getActiveCodeMirrorEditorView();
  return view ? view.state.doc.toString() : '';
};

export const focusActiveCodeMirrorEditor = (): boolean => {
  const view = getActiveCodeMirrorEditorView();
  if (!view) {
    return false;
  }

  view.focus();
  return true;
};

export const getActiveCodeMirrorCursorPosition = (): ActiveCodeMirrorCursorPosition | null => {
  const view = getActiveCodeMirrorEditorView();
  if (!view) {
    return null;
  }

  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return {
    lineNumber: line.number,
    column: (head - line.from) + 1,
  };
};

export const insertTextAtActiveCodeMirrorSelection = (text: string): boolean => {
  const view = getActiveCodeMirrorEditorView();
  if (!view) {
    return false;
  }

  const selection = view.state.selection.main;
  const nextAnchor = selection.from + text.length;
  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: text,
    },
    selection: {
      anchor: nextAnchor,
    },
  });
  view.focus();
  return true;
};
