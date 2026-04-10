import React from 'react';
import { Icon } from '../../Icons/Icon';
import { WorkspaceFileIcon } from '../../WorkspaceFileIcon/WorkspaceFileIcon';

export interface EditorItemProps {
  name: string;
  path: string;
  isDirty?: boolean;
  isActive?: boolean;
  onClick: () => void;
  onClose: () => void;
}

/**
 * 单个编辑器项组件
 */
export const EditorItem: React.FC<EditorItemProps> = ({
  name,
  path,
  isDirty = false,
  isActive = false,
  onClick,
  onClose,
}) => {
  return (
    <div
      className={`editor-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title={path}
    >
      <WorkspaceFileIcon
        filePath={path}
        name={name}
        isDirectory={false}
        size={14}
        className="editor-item-icon"
      />
      <span className="editor-item-name">{name}</span>
      <button
        className="editor-item-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="关闭"
      >
        {isDirty ? (
          <span className="editor-item-dirty-indicator">●</span>
        ) : (
          <Icon name="close" size={12} />
        )}
      </button>
    </div>
  );
};

export default EditorItem;





















