import React from 'react';

export interface EditorItemProps {
  name: string;
  path: string;
  isDirty?: boolean;
  isActive?: boolean;
  icon?: string;
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
  icon = '📄',
  onClick,
  onClose,
}) => {
  return (
    <div
      className={`editor-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title={path}
    >
      <span className="editor-item-icon">{icon}</span>
      <span className="editor-item-name">{name}</span>
      <button
        className="editor-item-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="关闭"
      >
        {isDirty ? '●' : '×'}
      </button>
    </div>
  );
};

export default EditorItem;





















