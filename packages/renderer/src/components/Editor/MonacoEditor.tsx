/**
 * Monaco 编辑器组件
 * 简化版本，自动应用当前主题
 */

import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import { useThemeStore } from '../../stores/themeStore';
import { initializeMonaco } from '../../hooks/useMonacoInit';

interface MonacoEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language = 'markdown',
  onChange
}) => {
  const currentTheme = useThemeStore(state => state.currentTheme);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [themeApplied, setThemeApplied] = useState(false);

  const handleEditorChange = (value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  const handleEditorDidMount = (editor: unknown, monaco: Monaco) => {
    // 全局初始化 Monaco（只在第一次调用时执行）
    initializeMonaco(monaco);
    
    setMonacoInstance(monaco);
    
    // 禁用编辑器内置的 F1 命令面板，并转发到全局命令中心
    const editorDomNode = (editor as { getDomNode: () => HTMLElement }).getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('keydown', (e: KeyboardEvent) => {
        // 拦截 F1
        if (e.key === 'F1') {
          e.preventDefault();
          e.stopPropagation();
          
          // 手动触发全局命令中心
          const globalCommandCenter = (window as unknown as Record<string, unknown>).__commandCenter;
          if (globalCommandCenter && typeof globalCommandCenter === 'object' && 'show' in globalCommandCenter) {
            (globalCommandCenter as { show: (prefix: string) => void }).show('>');
          }
        }
      }, true);
    }
  };

  // 应用主题到 Monaco
  useEffect(() => {
    if (!monacoInstance || !currentTheme) return;

    try {
      const themeId = `note-studio-${currentTheme.id}`;
      
      // 从主题数据中提取颜色
      const colors: Record<string, string> = {};
      
      // 编辑器基础颜色
      if (currentTheme.colors['--ws-editor.background']) {
        colors['--ws-editor.background'] = currentTheme.colors['--ws-editor.background'];
      }
      if (currentTheme.colors['editor.foreground']) {
        colors['editor.foreground'] = currentTheme.colors['editor.foreground'];
      }
      
      // 其他常用颜色
      if (currentTheme.colors['editorLineNumber.foreground']) {
        colors['editorLineNumber.foreground'] = currentTheme.colors['editorLineNumber.foreground'];
      }
      if (currentTheme.colors['editor.lineHighlightBackground']) {
        colors['editor.lineHighlightBackground'] = currentTheme.colors['editor.lineHighlightBackground'];
      }
      if (currentTheme.colors['editor.selectionBackground']) {
        colors['editor.selectionBackground'] = currentTheme.colors['editor.selectionBackground'];
      }

      // 创建 Monaco 主题
      const monacoTheme = {
        base: currentTheme.type === 'light' ? 'vs' as const : 'vs-dark' as const,
        inherit: true,
        rules: [],
        colors
      };

      monacoInstance.editor.defineTheme(themeId, monacoTheme);
      monacoInstance.editor.setTheme(themeId);
      setThemeApplied(true);
      
      console.log('[MonacoEditor] 主题已应用:', themeId);
    } catch (error) {
      console.error('[MonacoEditor] 主题应用失败:', error);
    }
  }, [monacoInstance, currentTheme]);

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      language={language}
      value={value}
      onChange={handleEditorChange}
      onMount={handleEditorDidMount}
      theme={themeApplied ? `note-studio-${currentTheme?.id}` : (currentTheme?.type === 'light' ? 'vs' : 'vs-dark')}
      options={{
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        minimap: {
          enabled: true
        },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        padding: {
          top: 16,
          bottom: 16
        },
        contextmenu: false
      }}
    />
  );
};
