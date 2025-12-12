/**
 * 知识库项组件
 * 功能：渲染单个知识库 * 描述：只显示知识库名称，支持选择、显示元数据、右键菜单等功能
 */

import React, { useState } from 'react';
import { KnowledgeItem } from './types';
import { 
  FolderIcon,
  getFileIcon,
  CheckIcon
} from './KnowledgeBaseIcons';
import { KnowledgeBaseContextMenu } from './KnowledgeBaseContextMenu';

interface KnowledgeBaseItemProps {
  /** 知识库项数据 */
  item: KnowledgeItem;
  /** 是否展开 */
  isExpanded: boolean;
  /** 是否选中 */
  isSelected: boolean;
  /** 缩进层级 */
  level: number;
  /** 点击事件 */
  onClick: (item: KnowledgeItem) => void;
  /** 切换展开事件 */
  onToggleExpand: (itemId: string) => void;
  /** 展开的项ID集合（用于子项） */
  expandedItems?: Set<string>;
  /** 选中的项ID（用于子项） */
  selectedItemId?: string;
  /** 修改知识*/
  onEdit?: (item: KnowledgeItem) => void;
  /** 删除知识*/
  onDelete?: (item: KnowledgeItem) => void;
  /** 打开设置*/
  onSettings?: (item: KnowledgeItem) => void;
}

/**
 * 格式化文件大小 */
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

/**
 * 格式化字 */
const formatWordCount = (count?: number): string => {
  if (!count) return '';
  if (count < 1000) return `${count}字`;
  return `${(count / 1000).toFixed(1)}k`;
};

export const KnowledgeBaseItem: React.FC<KnowledgeBaseItemProps> = ({
  item,
  isExpanded,
  isSelected,
  level,
  onClick,
  onToggleExpand,
  expandedItems,
  selectedItemId,
  onEdit,
  onDelete,
  onSettings,
}) => {
  const FileIcon = getFileIcon(item.metadata?.fileType);
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 触发选中
    onClick(item);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleEdit = (item: KnowledgeItem) => {
    onEdit?.(item);
  };

  const handleDelete = (item: KnowledgeItem) => {
    onDelete?.(item);
  };

  const handleSettings = (item: KnowledgeItem) => {
    onSettings?.(item);
  };

  return (
    <div className="knowledge-base-item">
      <div
        className={`knowledge-base-item__content ${isSelected ? 'selected' : ''}`}
        style={{ 
          paddingLeft: `${8 + level * 16}px`,
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* 文件/文件夹图标或封面 */}
        <div className="knowledge-base-item__type-icon">
          {item.type === 'folder' && item.metadata?.cover ? (
            <img 
              src={item.metadata.cover} 
              alt={item.title}
              className="knowledge-base-item__cover"
            />
          ) : item.type === 'folder' ? (
            <FolderIcon className="icon-folder" />
          ) : (
            <FileIcon className="icon-file" />
          )}
        </div>

        {/* 标题 */}
        <div className="knowledge-base-item__title">
          {item.title}
        </div>

        {/* 元数据*/}
        {item.metadata && (
          <div className="knowledge-base-item__metadata">
            {item.metadata.wordCount && (
              <span className="metadata-text">
                {formatWordCount(item.metadata.wordCount)}
              </span>
            )}
            {item.metadata.fileSize && (
              <span className="metadata-text">
                {formatFileSize(item.metadata.fileSize)}
              </span>
            )}
          </div>
        )}

        {/* 处理进度指示器（仅文件类型） */}
        {item.type === 'file' && item.metadata?.processingStatus && (
          <div className="knowledge-base-item__processing">
            <div className={`processing-indicator ${item.metadata.processingStatus}`}>
              {item.metadata.processingStatus === 'processing' && (
                <div className="processing-spinner" />
              )}
              {item.metadata.processingStatus === 'completed' && (
                <CheckIcon className="processing-check-icon" />
              )}
              <span className="processing-text">
                {item.metadata.processingStatus === 'processing' 
                  ? `${item.metadata.processingProgress ?? 0}%`
                  : item.metadata.processingStatus === 'completed'
                  ? '完成'
                  : item.metadata.processingStatus === 'error'
                  ? '失败'
                  : '等待中'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <KnowledgeBaseContextMenu
          item={item}
          position={contextMenu}
          onClose={handleCloseContextMenu}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onSettings={handleSettings}
        />
      )}
    </div>
  );
};

