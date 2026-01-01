/**
 * 笔记编辑器包装组件
 * 支持 CodeMirror/Monaco 编辑器切换
 */

import React, { useState, useCallback, useEffect } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { Icon } from '../Icons';
import './NoteEditorWrapper.scss';

export type EditorType = 'codemirror' | 'monaco';

export interface NoteEditorWrapperProps {
  content: string;
  onChange?: (content: string) => void;
  onWikilinkClick?: (title: string) => void;
  onTagClick?: (tagName: string) => void;
  defaultEditor?: EditorType;
  showEditorSwitch?: boolean;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
}

export const NoteEditorWrapper: React.FC<NoteEditorWrapperProps> = ({
  content,
  onChange,
  defaultEditor = 'codemirror',
  showEditorSwitch = true,
  placeholder = '开始写作...',
  editable = true,
  autoFocus = false,
}) => {
  const [editorType, setEditorType] = useState<EditorType>(defaultEditor);
  const [internalContent, setInternalContent] = useState(content);

  // 同步外部 content 变化
  useEffect(() => {
    setInternalContent(content);
  }, [content]);

  // 监听全局切换编辑器事件
  useEffect(() => {
    const handleToggleEditor = () => {
      setEditorType((prev) => (prev === 'codemirror' ? 'monaco' : 'codemirror'));
    };

    window.addEventListener('toggle-editor-type', handleToggleEditor);
    return () => {
      window.removeEventListener('toggle-editor-type', handleToggleEditor);
    };
  }, []);

  // 处理内容变化
  const handleContentChange = useCallback(
    (newContent: string) => {
      setInternalContent(newContent);
      if (onChange) {
        onChange(newContent);
      }
    },
    [onChange]
  );

  // 渲染编辑器
  const renderEditor = () => {
    if (editorType === 'codemirror') {
      return (
        <CodeMirrorEditor
          content={internalContent}
          onChange={handleContentChange}
          placeholder={placeholder}
          editable={editable}
          autoFocus={autoFocus}
        />
      );
    }

    // Monaco 编辑器 - 使用简单的 textarea 作为占位
    return (
      <div className="monaco-editor-placeholder">
        <textarea
          value={internalContent}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={placeholder}
          disabled={!editable}
          autoFocus={autoFocus}
          className="monaco-textarea"
        />
      </div>
    );
  };

  return (
    <div className="note-editor-wrapper">
      {showEditorSwitch && (
        <div className="editor-switch-bar">
          <div className="editor-switch-buttons">
            <div
              className={`editor-switch-button ${editorType === 'codemirror' ? 'active' : ''}`}
              onClick={() => setEditorType('codemirror')}
              title="CodeMirror 编辑器"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setEditorType('codemirror');
                }
              }}
            >
              <Icon name="code" size={14} />
              <span>CodeMirror</span>
            </div>
            <div
              className={`editor-switch-button ${editorType === 'monaco' ? 'active' : ''}`}
              onClick={() => setEditorType('monaco')}
              title="Monaco 源码编辑器"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setEditorType('monaco');
                }
              }}
            >
              <Icon name="terminal" size={14} />
              <span>Monaco</span>
            </div>
          </div>
        </div>
      )}
      <div className="editor-content">{renderEditor()}</div>
    </div>
  );
};

export default NoteEditorWrapper;
