/**
 * Monaco 编辑器组件
 */

import React from 'react';
import Editor from '@monaco-editor/react';

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
  const handleEditorChange = (value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  const handleEditorDidMount = (editor: any) => {
    // 禁用编辑器内置的 F1 命令面板，并转发到全局命令中心
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('keydown', (e: KeyboardEvent) => {
        // 拦截 F1 键
        if (e.key === 'F1') {
          e.preventDefault();
          e.stopPropagation();
          
          // 手动触发全局命令中心
          const globalCommandCenter = (window as any).__commandCenter;
          if (globalCommandCenter) {
            globalCommandCenter.show('>');
          }
        }
      }, true);
    }
  };

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      language={language}
      value={value}
      onChange={handleEditorChange}
      onMount={handleEditorDidMount}
      theme="vs-dark"
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
        // 禁用编辑器右键菜单
        contextmenu: false
      }}
    />
  );
};
