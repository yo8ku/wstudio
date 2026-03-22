/**
 * Monaco 浠ｇ爜鍧楃紪杈戝櫒缁勪欢
 * 鍔熻兘锛氬湪 CodeMirror 缂栬緫鍣ㄤ腑宓屽叆 Monaco Editor 浣滀负浠ｇ爜鍧楃紪杈戝櫒
 * 鎻忚堪锛氭彁渚涘畬鏁寸殑浠ｇ爜缂栬緫浣撻獙锛屽寘鎷娉曢珮浜€佽嚜鍔ㄨˉ鍏ㄣ€佷唬鐮佹姌鍙犵瓑鍔熻兘
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount, Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useThemeStore } from '../../../stores/themeStore';
import { applyStoredCodeBlockMonacoTheme, getCodeBlockMonacoThemeId } from './CodeBlockMonacoThemeAdapter';
import './CodeBlockMonaco.scss';

interface CodeBlockMonacoProps {
  /** 鍒濆浠ｇ爜鍐呭 */
  code: string;
  /** 缂栫▼璇█ */
  language: string;
  /** 浠ｇ爜鍧椾富棰?ID */
  theme?: string;
  /** 浠ｇ爜鍙樻洿鍥炶皟 */
  onChange?: (value: string) => void;
  /** 缂栬緫鍣ㄨ幏寰楃劍鐐瑰洖璋?*/
  onFocus?: () => void;
  /** 缂栬緫鍣ㄥけ鍘荤劍鐐瑰洖璋?*/
  onBlur?: () => void;
  /** 缂栬緫鍣ㄦ寕杞藉洖璋?*/
  onEditorMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  /** 鏄惁鍙 */
  readOnly?: boolean;
  /** 鏈€灏忛珮搴?*/
  minHeight?: number;
  /** 鏈€澶ч珮搴?*/
  maxHeight?: number;
  /** 鍒濆婊氬姩浣嶇疆 */
  initialScrollTop?: number;
}

/** Monaco 璇█鏄犲皠 */
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

/** 鑾峰彇 Monaco 璇█鏍囪瘑 */
const getMonacoLanguage = (lang: string): string => {
  return languageMap[lang] || lang || 'plaintext';
};

/** 璁＄畻缂栬緫鍣ㄩ珮搴?*/
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
  // 浣跨敤 ref 瀛樺偍 initialScrollTop锛岀‘淇濆湪 onMount 鍥炶皟涓兘鑾峰彇鍒版渶鏂板€?
  const initialScrollTopRef = useRef(initialScrollTop);
  // 鍚屾鏇存柊 ref
  initialScrollTopRef.current = initialScrollTop;
  
  const [height, setHeight] = useState(() => calculateHeight(code, minHeight, 400));
  const [needsScroll, setNeedsScroll] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [currentBlockTheme, setCurrentBlockTheme] = useState(theme);

  // 鑾峰彇鍏ㄥ眬涓婚锛堜綔涓洪粯璁ゅ€硷級
  const globalTheme = useThemeStore((state) => state.currentTheme);

  // 鑾峰彇 Monaco 涓婚 ID
  const getMonacoThemeId = useCallback((): string => {
    // 浼樺厛浣跨敤浠ｇ爜鍧楃嫭绔嬩富棰?
    if (currentBlockTheme) {
      return getCodeBlockMonacoThemeId(currentBlockTheme);
    }
    // 鍚﹀垯浣跨敤鍏ㄥ眬涓婚
    if (globalTheme?.id) {
      return getCodeBlockMonacoThemeId(globalTheme.id);
    }
    return globalTheme?.type === 'light' ? 'vs' : 'vs-dark';
  }, [currentBlockTheme, globalTheme]);

  // 浠ｇ爜鍧椾富棰樺彉鍖栨椂鏇存柊缂栬緫鍣?
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current || !currentBlockTheme) {
      return;
    }

    const themeId = getCodeBlockMonacoThemeId(currentBlockTheme);
    console.log('[CodeBlockMonaco] 鍒囨崲涓婚:', themeId);

    void applyStoredCodeBlockMonacoTheme(currentBlockTheme, monacoRef.current.editor);
  }, [currentBlockTheme]);

  // 澶栭儴 theme prop 鍙樺寲鏃舵洿鏂?
  useEffect(() => {
    if (theme !== undefined) {
      setCurrentBlockTheme(theme);
    }
  }, [theme]);

  // 璇█鍙樺寲鏃舵洿鏂?Monaco 缂栬緫鍣ㄨ瑷€
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const monacoLang = getMonacoLanguage(language);
        monacoRef.current.editor.setModelLanguage(model, monacoLang);
      }
    }
  }, [language]);

  // 缂栬緫鍣ㄦ寕杞藉洖璋?
  const handleEditorMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;

      // 搴旂敤褰撳墠涓婚
      const themeId = getMonacoThemeId();
      monaco.editor.setTheme(themeId);

      // 鐩戝惉鐒︾偣浜嬩欢
      editorInstance.onDidFocusEditorText(() => {
        onFocus?.();
      });

      editorInstance.onDidBlurEditorText(() => {
        onBlur?.();
      });

      // 鐩戝惉鍐呭鍙樺寲锛堥潪鍙楁帶妯″紡锛?
      editorInstance.onDidChangeModelContent(() => {
        const value = editorInstance.getValue();
        onChange?.(value);
        
        // 鏇存柊楂樺害 - 闄愬埗鏈€澶ч珮搴︿负 400
        const contentHeight = editorInstance.getContentHeight();
        const newHeight = Math.min(Math.max(contentHeight, minHeight), 400);
        setHeight(newHeight);
        setNeedsScroll(contentHeight > newHeight);
      });

      // 鍒濆璁剧疆楂樺害
      const contentHeight = editorInstance.getContentHeight();
      const initialHeight = Math.min(Math.max(contentHeight, minHeight), 400);
      setHeight(initialHeight);
      setNeedsScroll(contentHeight > initialHeight);
      
      // 鎭㈠婊氬姩浣嶇疆 - 浣跨敤 ref 鑾峰彇鏈€鏂板€?
      const scrollTopToRestore = initialScrollTopRef.current;
      console.log('[CodeBlockMonaco] 鎭㈠婊氬姩浣嶇疆:', scrollTopToRestore);
      if (scrollTopToRestore > 0) {
        // 浣跨敤 setTimeout 纭繚 Monaco 缂栬緫鍣ㄥ畬鍏ㄥ垵濮嬪寲
        setTimeout(() => {
          editorInstance.setScrollTop(scrollTopToRestore);
          console.log('[CodeBlockMonaco] 璁剧疆婊氬姩浣嶇疆瀹屾垚:', editorInstance.getScrollTop());
        }, 100);
      }
      
      // 鍥炶皟缂栬緫鍣ㄥ疄渚?
      onEditorMount?.(editorInstance, monaco);
    },
    [onFocus, onBlur, minHeight, onChange, getMonacoThemeId, onEditorMount]
  );

  // 鎷栧姩璋冩暣楂樺害
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

        // 鏇存柊婊氬姩鏉＄姸鎬?
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

  // 浣跨敤鍘熺敓 DOM 浜嬩欢鐩戝惉鍣ㄥ鐞嗛敭鐩樹簨浠?
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 鎹曡幏闃舵锛氬彧鎷︽埅琚?Electron 鑿滃崟鍔寔鐨勫揩鎹烽敭
    const handleKeyDownCapture = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === 'F1') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      if (!isCtrlOrMeta) return;

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editorRef.current) {
          editorRef.current.trigger('keyboard', 'undo', null);
        }
        return;
      }

      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editorRef.current) {
          editorRef.current.trigger('keyboard', 'redo', null);
        }
        return;
      }

      if (key === 'a') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editorRef.current) {
          editorRef.current.trigger('keyboard', 'editor.action.selectAll', null);
        }
        return;
      }

      if (key === 'f' || key === 'h' || (key === 'p' && e.shiftKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
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
            folding: false,
            codeLens: false,
            lightbulb: { enabled: false },
            hover: { enabled: false },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            wordBasedSuggestions: false,
            parameterHints: { enabled: false },
            inlineSuggest: { enabled: false },
            occurrencesHighlight: false,
            selectionHighlight: false,
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
          loading={<div className="code-block-monaco-loading">鍔犺浇涓?..</div>}
        />
      </div>
      <div className="code-block-monaco-resize-handle" onMouseDown={handleResizeStart}>
        <div className="code-block-monaco-resize-bar" />
      </div>
    </div>
  );
};

export default CodeBlockMonaco;

