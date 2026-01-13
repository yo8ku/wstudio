/**
 * Monaco 代码块编辑器组件
 * 功能：在 CodeMirror 编辑器中嵌入 Monaco Editor 作为代码块编辑器
 * 描述：提供完整的代码编辑体验，包括语法高亮、自动补全、代码折叠等功能
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import Editor, { OnMount, Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useThemeStore } from '../../../stores/themeStore';
import { themeService } from '../../../services/ThemeService';
import './CodeBlockMonaco.scss';

interface CodeBlockMonacoProps {
  /** 初始代码内容 */
  code: string;
  /** 编程语言 */
  language: string;
  /** 代码块主题 ID */
  theme?: string;
  /** 代码变更回调 */
  onChange?: (value: string) => void;
  /** 编辑器获得焦点回调 */
  onFocus?: () => void;
  /** 编辑器失去焦点回调 */
  onBlur?: () => void;
  /** 编辑器挂载回调 */
  onEditorMount?: (editor: editor.IStandaloneCodeEditor) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 最小高度 */
  minHeight?: number;
  /** 最大高度 */
  maxHeight?: number;
  /** 初始滚动位置 */
  initialScrollTop?: number;
}

/** Monaco 语言映射 */
const languageMap: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  jsx: 'javascript',
  tsx: 'typescript',
  plaintext: 'plaintext',
  text: 'plaintext'
};

/** 获取 Monaco 语言标识 */
const getMonacoLanguage = (lang: string): string => {
  return languageMap[lang] || lang || 'plaintext';
};

/** 计算编辑器高度 */
const calculateHeight = (code: string, minHeight: number, maxHeight: number): number => {
  const lineCount = Math.max((code || '').split('\n').length, 1);
  const lineHeight = 19;
  const padding = 16; // top 8 + bottom 8
  const calculatedHeight = lineCount * lineHeight + padding;
  return Math.min(Math.max(calculatedHeight, minHeight), maxHeight);
};

export const CodeBlockMonaco: React.FC<CodeBlockMonacoProps> = ({
  code,
  language,
  theme,
  onChange,
  onFocus,
  onBlur,
  onEditorMount,
  readOnly = false,
  minHeight = 60,
  maxHeight = 800,
  initialScrollTop = 0
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 使用 ref 存储 initialScrollTop，确保在 onMount 回调中能获取到最新值
  const initialScrollTopRef = useRef(initialScrollTop);
  // 同步更新 ref
  initialScrollTopRef.current = initialScrollTop;
  
  const [height, setHeight] = useState(() => calculateHeight(code, minHeight, 400));
  const [needsScroll, setNeedsScroll] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [currentBlockTheme, setCurrentBlockTheme] = useState(theme);

  // 获取全局主题（作为默认值）
  const globalTheme = useThemeStore((state) => state.currentTheme);

  // 获取 Monaco 主题 ID
  const getMonacoThemeId = useCallback((): string => {
    // 优先使用代码块独立主题
    if (currentBlockTheme) {
      return `custom-${currentBlockTheme}`;
    }
    // 否则使用全局主题
    if (globalTheme?.id) {
      return `custom-${globalTheme.id}`;
    }
    return globalTheme?.type === 'light' ? 'vs' : 'vs-dark';
  }, [currentBlockTheme, globalTheme]);

  // 代码块主题变化时更新编辑器
  useEffect(() => {
    const applyTheme = async () => {
      if (!monacoRef.current || !editorRef.current || !currentBlockTheme) return;

      const themeId = `custom-${currentBlockTheme}`;
      console.log('[CodeBlockMonaco] 切换主题:', themeId);

      // 获取主题数据并注册到 Monaco
      const themeData = await themeService.getTheme(currentBlockTheme);
      if (themeData && monacoRef.current) {
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
          themeData.tokenColors.forEach((token) => {
            if (token.scope && token.settings) {
              const scopes = Array.isArray(token.scope) ? token.scope : [token.scope];
              scopes.forEach((scope) => {
                const rule: editor.ITokenThemeRule = { token: scope };
                if (token.settings.foreground) {
                  rule.foreground = token.settings.foreground.replace('#', '');
                }
                if (token.settings.background) {
                  rule.background = token.settings.background.replace('#', '');
                }
                if (token.settings.fontStyle) {
                  rule.fontStyle = token.settings.fontStyle;
                }
                rules.push(rule);
              });
            }
          });
        }

        // 注册主题
        monacoRef.current.editor.defineTheme(themeId, {
          base: themeData.type === 'light' ? 'vs' : 'vs-dark',
          inherit: true,
          rules,
          colors
        });

        // 应用主题
        monacoRef.current.editor.setTheme(themeId);
      }
    };

    applyTheme();
  }, [currentBlockTheme]);

  // 外部 theme prop 变化时更新
  useEffect(() => {
    if (theme !== undefined) {
      setCurrentBlockTheme(theme);
    }
  }, [theme]);

  // 语言变化时更新 Monaco 编辑器语言
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const monacoLang = getMonacoLanguage(language);
        monacoRef.current.editor.setModelLanguage(model, monacoLang);
      }
    }
  }, [language]);

  // 编辑器挂载回调
  const handleEditorMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;

      // 应用当前主题
      const themeId = getMonacoThemeId();
      monaco.editor.setTheme(themeId);

      // 监听焦点事件
      editorInstance.onDidFocusEditorText(() => {
        onFocus?.();
      });

      editorInstance.onDidBlurEditorText(() => {
        onBlur?.();
      });

      // 监听内容变化（非受控模式）
      editorInstance.onDidChangeModelContent(() => {
        const value = editorInstance.getValue();
        onChange?.(value);
        
        // 更新高度 - 限制最大高度为 400
        const contentHeight = editorInstance.getContentHeight();
        const newHeight = Math.min(Math.max(contentHeight, minHeight), 400);
        setHeight(newHeight);
        setNeedsScroll(contentHeight > newHeight);
      });

      // 初始设置高度
      const contentHeight = editorInstance.getContentHeight();
      const initialHeight = Math.min(Math.max(contentHeight, minHeight), 400);
      setHeight(initialHeight);
      setNeedsScroll(contentHeight > initialHeight);
      
      // 恢复滚动位置 - 使用 ref 获取最新值
      const scrollTopToRestore = initialScrollTopRef.current;
      console.log('[CodeBlockMonaco] 恢复滚动位置:', scrollTopToRestore);
      if (scrollTopToRestore > 0) {
        // 使用 setTimeout 确保 Monaco 编辑器完全初始化
        setTimeout(() => {
          editorInstance.setScrollTop(scrollTopToRestore);
          console.log('[CodeBlockMonaco] 设置滚动位置完成:', editorInstance.getScrollTop());
        }, 100);
      }
      
      // 回调编辑器实例
      onEditorMount?.(editorInstance);
    },
    [onFocus, onBlur, minHeight, onChange, getMonacoThemeId, onEditorMount]
  );

  // 拖动调整高度
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight);
        setHeight(newHeight);

        // 更新滚动条状态
        if (editorRef.current) {
          const contentHeight = editorRef.current.getContentHeight();
          setNeedsScroll(contentHeight > newHeight);
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [height, minHeight, maxHeight]
  );

  // 使用原生 DOM 事件监听器处理键盘事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 捕获阶段：只拦截被 Electron 菜单劫持的快捷键
    const handleKeyDownCapture = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // 只处理被 Electron 菜单劫持的快捷键
      if (!isCtrlOrMeta) return;

      // 手动处理 Ctrl+Z 撤销
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editorRef.current) {
          editorRef.current.trigger('keyboard', 'undo', null);
        }
        return;
      }

      // 手动处理 Ctrl+Shift+Z 或 Ctrl+Y 重做
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editorRef.current) {
          editorRef.current.trigger('keyboard', 'redo', null);
        }
        return;
      }

      // 手动处理 Ctrl+A 全选
      if (key === 'a') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editorRef.current) {
          editorRef.current.trigger('keyboard', 'editor.action.selectAll', null);
        }
        return;
      }
    };

    container.addEventListener('keydown', handleKeyDownCapture, true);

    return () => {
      container.removeEventListener('keydown', handleKeyDownCapture, true);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`code-block-monaco ${isResizing ? 'is-resizing' : ''}`}
    >
      <div className="code-block-monaco-editor" style={{ height }}>
        <Editor
          height="100%"
          language={getMonacoLanguage(language)}
          defaultValue={code}
          onMount={handleEditorMount}
          theme={getMonacoThemeId()}
          options={{
            readOnly,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            scrollBeyondLastColumn: 0,
            lineNumbers: 'on',
            lineNumbersMinChars: 4,
            glyphMargin: false,
            folding: true,
            wordWrap: 'on',
            automaticLayout: true,
            fontSize: 13,
            lineHeight: 19,
            padding: { top: 8, bottom: 8 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            renderLineHighlight: 'none',
            renderLineHighlightOnlyWhenFocus: true,
            lineDecorationsWidth: 0,
            contextmenu: false,
            renderValidationDecorations: 'off',
            scrollbar: {
              vertical: needsScroll ? 'auto' : 'hidden',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              alwaysConsumeMouseWheel: false
            }
          }}
          loading={<div className="code-block-monaco-loading">加载中...</div>}
        />
      </div>
      <div className="code-block-monaco-resize-handle" onMouseDown={handleResizeStart}>
        <div className="code-block-monaco-resize-bar" />
      </div>
    </div>
  );
};

export default CodeBlockMonaco;
