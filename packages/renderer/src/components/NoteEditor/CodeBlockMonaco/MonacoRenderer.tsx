/**
 * Monaco 渲染器
 * 功能：将 Monaco React 组件渲染到原生 DOM 元素中
 * 描述：用于在 CodeMirror Widget 中集成 Monaco Editor
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as monaco from 'monaco-editor';
import { CodeBlockMonaco } from './CodeBlockMonaco';
import type { editor } from 'monaco-editor';
import { themeService } from '../../../services/ThemeService';

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
  /** 初始滚动位置 */
  initialScrollTop?: number;
  /** 编辑器实例回调 */
  onEditorMount?: (editor: editor.IStandaloneCodeEditor) => void;
}

/** 滚动位置信息 */
interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

// 存储 React Root 实例，用于卸载
const rootMap = new WeakMap<HTMLElement, Root>();
// 存储渲染选项，用于更新
const optionsMap = new WeakMap<HTMLElement, MonacoRenderOptions>();
// 存储编辑器实例，用于获取滚动位置
const editorMap = new WeakMap<HTMLElement, editor.IStandaloneCodeEditor>();

/**
 * 获取 Monaco 编辑器的滚动位置
 * @param container 目标容器元素
 * @returns 滚动位置信息，如果编辑器不存在则返回 null
 */
export function getMonacoScrollPosition(container: HTMLElement): ScrollPosition | null {
  const editorInstance = editorMap.get(container);
  if (!editorInstance) return null;
  
  return {
    scrollTop: editorInstance.getScrollTop(),
    scrollLeft: editorInstance.getScrollLeft()
  };
}

/**
 * 设置 Monaco 编辑器的滚动位置
 * @param container 目标容器元素
 * @param position 滚动位置
 */
export function setMonacoScrollPosition(container: HTMLElement, position: ScrollPosition): void {
  const editorInstance = editorMap.get(container);
  if (!editorInstance) return;
  
  editorInstance.setScrollTop(position.scrollTop);
  editorInstance.setScrollLeft(position.scrollLeft);
}

/**
 * 将 Monaco 编辑器渲染到指定 DOM 元素
 * @param container 目标容器元素
 * @param options 渲染选项
 */
export function renderMonacoToElement(container: HTMLElement, options: MonacoRenderOptions): void {
  // 如果已有 Root，先卸载
  const existingRoot = rootMap.get(container);
  if (existingRoot) {
    existingRoot.unmount();
  }

  // 存储选项
  optionsMap.set(container, options);

  // 创建新的 Root 并渲染
  const root = createRoot(container);
  rootMap.set(container, root);

  console.log('[MonacoRenderer] 渲染 Monaco，initialScrollTop:', options.initialScrollTop);

  // 保存 initialScrollTop 到闭包中
  const scrollTopToRestore = options.initialScrollTop || 0;

  // 编辑器挂载回调，存储编辑器实例并恢复滚动位置
  const handleEditorMount = (editorInstance: editor.IStandaloneCodeEditor) => {
    editorMap.set(container, editorInstance);
    
    // 在这里恢复滚动位置，确保使用闭包中保存的值
    if (scrollTopToRestore > 0) {
      console.log('[MonacoRenderer] 恢复滚动位置:', scrollTopToRestore);
      setTimeout(() => {
        editorInstance.setScrollTop(scrollTopToRestore);
        console.log('[MonacoRenderer] 设置滚动位置完成:', editorInstance.getScrollTop());
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

/**
 * 更新 Monaco 编辑器主题
 * @param container 目标容器元素
 * @param theme 新主题 ID
 */
export function updateMonacoTheme(container: HTMLElement, theme: string): void {
  const options = optionsMap.get(container);
  const editorInstance = editorMap.get(container);

  console.log('[MonacoRenderer] updateMonacoTheme:', theme, 'editorInstance:', !!editorInstance);

  if (options) {
    // 更新选项中的主题
    options.theme = theme;
  }

  // 直接在现有编辑器上应用主题
  if (editorInstance) {
    // 动态导入 themeService 并应用主题
    void (async () => {
      const themeData = await themeService.getTheme(theme);
      console.log('[MonacoRenderer] themeData:', !!themeData);
      if (themeData) {
        // 动态导入 monaco-editor
        const themeId = `custom-${theme}`;
        
        // 转换主题颜色
        const colors: Record<string, string> = {};
        if (themeData.colors) {
          Object.entries(themeData.colors).forEach(([key, value]) => {
            if (typeof value === 'string') {
              colors[key] = value;
            }
          });
        }

        // 转换 token 规则
        const rules: editor.ITokenThemeRule[] = [];
        if (themeData.tokenColors) {
          themeData.tokenColors.forEach((token: { scope?: string | string[]; settings?: { foreground?: string; background?: string; fontStyle?: string } }) => {
            if (token.scope && token.settings) {
              const scopes = Array.isArray(token.scope) ? token.scope : [token.scope];
              scopes.forEach((scope: string) => {
                const rule: editor.ITokenThemeRule = { token: scope };
                if (token.settings?.foreground) {
                  rule.foreground = token.settings.foreground.replace('#', '');
                }
                if (token.settings?.background) {
                  rule.background = token.settings.background.replace('#', '');
                }
                if (token.settings?.fontStyle) {
                  rule.fontStyle = token.settings.fontStyle;
                }
                rules.push(rule);
              });
            }
          });
        }

        // 注册主题
        monaco.editor.defineTheme(themeId, {
          base: themeData.type === 'light' ? 'vs' : 'vs-dark',
          inherit: true,
          rules,
          colors
        });

        // 应用主题
        console.log('[MonacoRenderer] 应用主题:', themeId);
        monaco.editor.setTheme(themeId);
      }
    })();
  }
}

/**
 * 更新 Monaco 编辑器语言
 * @param container 目标容器元素
 * @param language 新语言
 */
export function updateMonacoLanguage(container: HTMLElement, language: string): void {
  const options = optionsMap.get(container);
  const editorInstance = editorMap.get(container);

  if (options) {
    // 更新选项中的语言
    options.language = language;
  }

  // 直接更新编辑器的语言模型，不重新渲染组件
  if (editorInstance) {
    const model = editorInstance.getModel();
    if (model) {
      // 获取 Monaco 实例并设置语言
      monaco.editor.setModelLanguage(model, language);
    }
  }
}

/**
 * 从指定 DOM 元素卸载 Monaco 编辑器
 * @param container 目标容器元素
 */
export function unmountMonacoFromElement(container: HTMLElement): void {
  const root = rootMap.get(container);
  if (root) {
    root.unmount();
    rootMap.delete(container);
  }
}
