/**
 * Knowledge base item component.
 * Renders a single knowledge base or file item with metadata and processing status.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KnowledgeItem } from './types';
import {
  FolderIcon,
  getFileIcon,
  CheckIcon,
} from './KnowledgeBaseIcons';
import { KnowledgeBaseContextMenu } from './KnowledgeBaseContextMenu';

interface KnowledgeBaseItemProps {
  item: KnowledgeItem;
  isExpanded: boolean;
  isSelected: boolean;
  level: number;
  onClick: (item: KnowledgeItem) => void;
  onToggleExpand: (itemId: string) => void;
  expandedItems?: Set<string>;
  selectedItemId?: string;
  onEdit?: (item: KnowledgeItem) => void;
  onDelete?: (item: KnowledgeItem) => void;
  onSettings?: (item: KnowledgeItem) => void;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatWordCount = (count: number | undefined, unit: string): string => {
  if (!count) {
    return '';
  }
  if (count < 1000) {
    return `${count}${unit}`;
  }
  return `${(count / 1000).toFixed(1)}k${unit}`;
};

export const KnowledgeBaseItem: React.FC<KnowledgeBaseItemProps> = ({
  item,
  isSelected,
  level,
  onClick,
  onEdit,
  onDelete,
  onSettings,
}) => {
  const { t } = useTranslation();
  const fileIcon = getFileIcon(item.metadata?.fileType);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const wordCountUnit = String(t('knowledgeBase.item.wordCountUnit', { defaultValue: ' chars' }));

  const processingText = item.metadata?.processingStatus === 'completed'
    ? String(t('knowledgeBase.item.completed', { defaultValue: 'Completed' }))
    : item.metadata?.processingStatus === 'error'
      ? String(t('knowledgeBase.item.failed', { defaultValue: 'Failed' }))
      : String(t('knowledgeBase.item.pending', { defaultValue: 'Pending' }));

  return (
    <div className="knowledge-base-item">
      <div
        className={`knowledge-base-item__content ${isSelected ? 'selected' : ''}`}
        style={{
          paddingLeft: `${8 + level * 16}px`,
        }}
        onClick={(event) => {
          event.stopPropagation();
          onClick(item);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
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
            React.createElement(fileIcon, { className: 'icon-file' })
          )}
        </div>

        <div className="knowledge-base-item__title">{item.title}</div>

        {item.metadata && (
          <div className="knowledge-base-item__metadata">
            {item.metadata.wordCount && (
              <span className="metadata-text">
                {formatWordCount(item.metadata.wordCount, wordCountUnit)}
              </span>
            )}
            {item.metadata.fileSize && (
              <span className="metadata-text">
                {formatFileSize(item.metadata.fileSize)}
              </span>
            )}
          </div>
        )}

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
                  : processingText}
              </span>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <KnowledgeBaseContextMenu
          item={item}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onEdit={(currentItem) => onEdit?.(currentItem)}
          onDelete={(currentItem) => onDelete?.(currentItem)}
          onSettings={(currentItem) => onSettings?.(currentItem)}
        />
      )}
    </div>
  );
};
