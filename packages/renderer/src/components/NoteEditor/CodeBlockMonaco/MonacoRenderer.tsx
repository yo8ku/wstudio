/**
 * Renders Monaco code blocks into standalone DOM containers for CodeMirror widgets.
 * Keeps the runtime bound to the mounted Monaco instance so the renderer does not
 * import the full monaco-editor package directly.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { CodeBlockMonaco } from './CodeBlockMonaco';
import { applyStoredCodeBlockMonacoTheme } from './CodeBlockMonacoThemeAdapter';

interface MonacoRenderOptions {
  code: string;
  language: string;
  theme?: string;
  onChange?: (value: string) => void;
  onThemeChange?: (theme: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  readOnly?: boolean;
  minHeight?: number;
  maxHeight?: number;
  initialScrollTop?: number;
  onEditorMount?: (editorInstance: editor.IStandaloneCodeEditor) => void;
}

interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

const rootMap = new WeakMap<HTMLElement, Root>();
const optionsMap = new WeakMap<HTMLElement, MonacoRenderOptions>();
const editorMap = new WeakMap<HTMLElement, editor.IStandaloneCodeEditor>();
const monacoMap = new WeakMap<HTMLElement, Monaco>();
const pendingUnmountFrameMap = new WeakMap<HTMLElement, number>();

export function getMonacoScrollPosition(container: HTMLElement): ScrollPosition | null {
  const editorInstance = editorMap.get(container);
  if (!editorInstance) {
    return null;
  }

  return {
    scrollTop: editorInstance.getScrollTop(),
    scrollLeft: editorInstance.getScrollLeft(),
  };
}

export function setMonacoScrollPosition(container: HTMLElement, position: ScrollPosition): void {
  const editorInstance = editorMap.get(container);
  if (!editorInstance) {
    return;
  }

  editorInstance.setScrollTop(position.scrollTop);
  editorInstance.setScrollLeft(position.scrollLeft);
}

export function renderMonacoToElement(container: HTMLElement, options: MonacoRenderOptions): void {
  const pendingUnmountFrame = pendingUnmountFrameMap.get(container);
  if (pendingUnmountFrame !== undefined) {
    window.cancelAnimationFrame(pendingUnmountFrame);
    pendingUnmountFrameMap.delete(container);
  }

  optionsMap.set(container, options);

  let root = rootMap.get(container);
  if (!root) {
    root = createRoot(container);
    rootMap.set(container, root);
  }

  const scrollTopToRestore = options.initialScrollTop || 0;

  const handleEditorMount = (
    editorInstance: editor.IStandaloneCodeEditor,
    monacoInstance: Monaco
  ) => {
    editorMap.set(container, editorInstance);
    monacoMap.set(container, monacoInstance);

    if (scrollTopToRestore > 0) {
      setTimeout(() => {
        editorInstance.setScrollTop(scrollTopToRestore);
      }, 100);
    }

    options.onEditorMount?.(editorInstance);
  };

  root.render(
    <CodeBlockMonaco
      code={options.code}
      language={options.language}
      theme={options.theme}
      onChange={options.onChange}
      onFocus={options.onFocus}
      onBlur={options.onBlur}
      onEditorMount={handleEditorMount}
      readOnly={options.readOnly}
      minHeight={options.minHeight}
      maxHeight={options.maxHeight}
      initialScrollTop={options.initialScrollTop}
    />
  );
}

export function updateMonacoTheme(container: HTMLElement, theme: string): void {
  const options = optionsMap.get(container);
  const monacoInstance = monacoMap.get(container);

  if (options) {
    options.theme = theme;
  }

  if (monacoInstance) {
    void applyStoredCodeBlockMonacoTheme(theme, monacoInstance.editor);
  }
}

export function updateMonacoLanguage(container: HTMLElement, language: string): void {
  const options = optionsMap.get(container);
  const editorInstance = editorMap.get(container);
  const monacoInstance = monacoMap.get(container);

  if (options) {
    options.language = language;
  }

  if (!editorInstance || !monacoInstance) {
    return;
  }

  const model = editorInstance.getModel();
  if (!model) {
    return;
  }

  monacoInstance.editor.setModelLanguage(model, language);
}

export function unmountMonacoFromElement(container: HTMLElement): void {
  const root = rootMap.get(container);
  if (root) {
    const pendingUnmountFrame = pendingUnmountFrameMap.get(container);
    if (pendingUnmountFrame !== undefined) {
      window.cancelAnimationFrame(pendingUnmountFrame);
    }

    const nextUnmountFrame = window.requestAnimationFrame(() => {
      if (rootMap.get(container) !== root) {
        return;
      }

      root.unmount();
      rootMap.delete(container);
      editorMap.delete(container);
      monacoMap.delete(container);
      optionsMap.delete(container);
      pendingUnmountFrameMap.delete(container);
    });

    pendingUnmountFrameMap.set(container, nextUnmountFrame);
    return;
  }

  editorMap.delete(container);
  monacoMap.delete(container);
  optionsMap.delete(container);
}
