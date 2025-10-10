/**
 * 知识库右键菜单组件
 * 功能：为知识库项提供上下文菜单
 * 描述：支持修改资料、删除知识库、添加到聊天等功能
 */

import React, { useEffect, useRef } from 'react';
import { KnowledgeItem } from './types';

interface KnowledgeBaseContextMenuProps {
  /** 目标项 */
  item: KnowledgeItem;
  /** 菜单位置 */
  position: { x: number; y: number };
  /** 关闭菜单 */
  onClose: () => void;
  /** 修改资料 */
  onEdit: (item: KnowledgeItem) => void;
  /** 删除知识库 */
  onDelete: (item: KnowledgeItem) => void;
  /** 添加到聊天 */
  onAddToChat: (item: KnowledgeItem) => void;
}

export const KnowledgeBaseContextMenu: React.FC<KnowledgeBaseContextMenuProps> = ({
  item,
  position,
  onClose,
  onEdit,
  onDelete,
  onAddToChat,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // 延迟添加监听，避免立即触发
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // ESC 键关闭菜单
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleEdit = () => {
    onEdit(item);
    onClose();
  };

  const handleDelete = () => {
    onDelete(item);
    onClose();
  };

  const handleAddToChat = () => {
    onAddToChat(item);
    onClose();
  };

  // 确保菜单不超出屏幕
  const adjustedPosition = { ...position };
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect();
    if (position.x + rect.width > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - rect.width - 10;
    }
    if (position.y + rect.height > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - rect.height - 10;
    }
  }

  return (
    <div
      ref={menuRef}
      className="knowledge-base-context-menu"
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
        zIndex: 10000,
      }}
    >
      {/* 只有文件夹类型才能修改资料 */}
      {item.type === 'folder' && (
        <div className="context-menu-item" onClick={handleEdit}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.854 2.854a.5.5 0 0 0-.708 0L11 4l1 1 1.146-1.146a.5.5 0 0 0 0-.708l-.292-.292zM10 5L5 10v1h1l5-5-1-1zM3 11.5V13h1.5l6.5-6.5-1.5-1.5L3 11.5z"/>
          </svg>
          <span>修改资料</span>
        </div>
      )}

      <div className="context-menu-item" onClick={handleAddToChat}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v8A1.5 1.5 0 0 0 2.5 12h1.5v2.5a.5.5 0 0 0 .854.354l3.146-3.146A.5.5 0 0 0 7.646 11H2.5a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 1 0v-4A1.5 1.5 0 0 0 13.5 1h-11z"/>
          <path d="M12 8a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h1.5v-1.5a.5.5 0 0 1 .5-.5z"/>
          <path d="M12.5 8.5a.5.5 0 0 0-1 0v1.5H10a.5.5 0 0 0 0 1h2a.5.5 0 0 0 .5-.5v-2z"/>
        </svg>
        <span>添加到聊天</span>
      </div>

      <div className="context-menu-divider" />

      <div className="context-menu-item context-menu-item--danger" onClick={handleDelete}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
          <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
        <span>删除知识库</span>
      </div>
    </div>
  );
};

