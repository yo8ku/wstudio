/**
 * 笔记编辑器包装组件
 * 根据设置切换 TipTap/CodeMirror/Monaco 编辑器
 */

import React, { useState, useCallback, useEffect } from 'react';
import { TipTapNoteEditor } from './TipTapNoteEditor';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { Icon } from '../Icons';
import './NoteEditorWrapper.scss';

export type EditorType = 'tiptap' | 'codemirror' | 'monaco';

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
  onWikilinkClick,
  onTagClick,
  defaultEditor = 'tiptap',
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
      setEditorType((prev) => {
        if (prev === 'tiptap') return 'codemirror';
        if (prev === 'codemirror') return 'monaco';
        return 'tiptap';
      });
    };

    window.addEventListener('toggle-editor-type', handleToggleEditor);
    return () => {
      window.removeEventListener('toggle-editor-type', handleToggleEditor);
    };
  }, []);

  // 处理内容变化
  const handleContentChange = useCallback((newContent: string) => {
    setInternalContent(newContent);
    if (onChange) {
      onChange(newContent);
    }
  }, [onChange]);

  // 切换编辑器
  const toggleEditor = useCallback(() => {
    setEditorType((prev) => {
      if (prev === 'tiptap') return 'codemirror';
      if (prev === 'codemirror') return 'monaco';
      return 'tiptap';
    });
  }, []);


  // 渲染编辑器
  const renderEditor = () => {
    if (editorType === 'tiptap') {
      return (
        <TipTapNoteEditor
          content={internalContent}
          onChange={handleContentChange}
          onWikilinkClick={onWikilinkClick}
          onTagClick={onTagClick}
          placeholder={placeholder}
          editable={editable}
          autoFocus={autoFocus}
        />
      );
    }

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
    // 实际项目中应该集成现有的 Monaco 编辑器组件
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
              className={`editor-switch-button ${editorType === 'tiptap' ? 'active' : ''}`}
              onClick={() => setEditorType('tiptap')}
              title="富文本编辑器 (TipTap)"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setEditorType('tiptap');
                }
              }}
            >
              <Icon name="edit" size={14} />
              <span>TipTap</span>
            </div>
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
      <div className="editor-content">
        {renderEditor()}
      </div>
    </div>
  );
};

export default NoteEditorWrapper;
