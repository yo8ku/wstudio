/**
 * 笔记编辑器包装组件。
 * 统一使用 CodeMirror 作为唯一的笔记编辑实现，保留历史 props 以兼容旧调用方。
 */

import React, { useCallback } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import './NoteEditorWrapper.scss';

export type EditorType = 'codemirror';

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
  placeholder = '开始写作...',
  editable = true,
  autoFocus = false,
}) => {
  const handleContentChange = useCallback((nextContent: string) => {
    onChange?.(nextContent);
  }, [onChange]);

  return (
    <div className="note-editor-wrapper">
      <div className="editor-content">
        <CodeMirrorEditor
          content={content}
          onChange={handleContentChange}
          placeholder={placeholder}
          editable={editable}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
};

export default NoteEditorWrapper;
