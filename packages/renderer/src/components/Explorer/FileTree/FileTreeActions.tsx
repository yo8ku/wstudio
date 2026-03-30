import React from 'react';
import { useTranslation } from 'react-i18next';

export interface FileTreeActionsProps {
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapse?: () => void;
}

export const FileTreeActions: React.FC<FileTreeActionsProps> = ({
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapse,
}) => {
  const { t } = useTranslation();

  return (
    <div className="file-tree-actions">
      {onNewFile && (
        <button
          className="file-tree-action-button"
          title={String(t('explorerView.workspaceMenu.general.newFile', { defaultValue: 'New File' }))}
          onClick={onNewFile}
        >
          📄
        </button>
      )}
      {onNewFolder && (
        <button
          className="file-tree-action-button"
          title={String(t('explorerView.workspaceMenu.general.newFolder', { defaultValue: 'New Folder' }))}
          onClick={onNewFolder}
        >
          📁
        </button>
      )}
      {onRefresh && (
        <button
          className="file-tree-action-button"
          title={String(t('explorerView.workspaceMenu.general.refresh', { defaultValue: 'Refresh' }))}
          onClick={onRefresh}
        >
          🔄
        </button>
      )}
      {onCollapse && (
        <button
          className="file-tree-action-button"
          title={String(t('explorerView.workspaceMenu.general.collapseAll', { defaultValue: 'Collapse All' }))}
          onClick={onCollapse}
        >
          ▾
        </button>
      )}
    </div>
  );
};

export default FileTreeActions;
