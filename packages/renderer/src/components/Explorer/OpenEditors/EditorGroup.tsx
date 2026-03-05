import React from 'react';
import { EditorItem, EditorItemProps } from './EditorItem';

export interface EditorGroupProps {
  groupName?: string;
  hideGroupName?: boolean;
  editors: Omit<EditorItemProps, 'onClick' | 'onClose'>[];
  onEditorClick: (path: string) => void;
  onEditorClose: (path: string) => void;
}

/**
 * 编辑器组组件
 * 支持分组显示打开的编辑器
 */
export const EditorGroup: React.FC<EditorGroupProps> = ({
  groupName,
  hideGroupName = false,
  editors,
  onEditorClick,
  onEditorClose,
}) => {
  return (
    <div className="editor-group">
      {!hideGroupName && groupName && <div className="editor-group-name">{groupName}</div>}
      <div className="editor-group-items">
        {editors.map((editor) => (
          <EditorItem
            key={editor.path}
            {...editor}
            onClick={() => onEditorClick(editor.path)}
            onClose={() => onEditorClose(editor.path)}
          />
        ))}
      </div>
    </div>
  );
};

export default EditorGroup;





















