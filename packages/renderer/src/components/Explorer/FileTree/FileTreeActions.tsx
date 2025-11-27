import React from 'react';

export interface FileTreeActionsProps {
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapse?: () => void;
}

/**
 * 文件树工具栏
 * 提供新建文件、新建文件夹、刷新等操作
 */
export const FileTreeActions: React.FC<FileTreeActionsProps> = ({
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapse,
}) => {
  return (
    <div className="file-tree-actions">
      {onNewFile && (
        <button
          className="file-tree-action-button"
          title="新建文件"
          onClick={onNewFile}
        >
          📄
        </button>
      )}
      {onNewFolder && (
        <button
          className="file-tree-action-button"
          title="新建文件夹"
          onClick={onNewFolder}
        >
          📁
        </button>
      )}
      {onRefresh && (
        <button
          className="file-tree-action-button"
          title="刷新"
          onClick={onRefresh}
        >
          🔄
        </button>
      )}
      {onCollapse && (
        <button
          className="file-tree-action-button"
          title="折叠所有"
          onClick={onCollapse}
        >
          ⊟
        </button>
      )}
    </div>
  );
};

export default FileTreeActions;





















