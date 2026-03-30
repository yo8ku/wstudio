import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KnowledgeItem } from './types';

interface KnowledgeBaseContextMenuProps {
  item: KnowledgeItem;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: (item: KnowledgeItem) => void;
  onDelete: (item: KnowledgeItem) => void;
  onSettings?: (item: KnowledgeItem) => void;
}

export const KnowledgeBaseContextMenu: React.FC<KnowledgeBaseContextMenuProps> = ({
  item,
  position,
  onClose,
  onEdit,
  onDelete,
  onSettings,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

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

  const itemType = item.type === 'folder'
    ? String(t('knowledgeBase.itemTypes.folder', { defaultValue: 'Knowledge Base' }))
    : String(t('knowledgeBase.itemTypes.file', { defaultValue: 'File' }));

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
      {item.type === 'folder' && (
        <>
          <div className="context-menu-item" onClick={() => { onEdit(item); onClose(); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.854 2.854a.5.5 0 0 0-.708 0L11 4l1 1 1.146-1.146a.5.5 0 0 0 0-.708l-.292-.292zM10 5L5 10v1h1l5-5-1-1zM3 11.5V13h1.5l6.5-6.5-1.5-1.5L3 11.5z" />
            </svg>
            <span>{String(t('knowledgeBase.contextMenu.upload', { defaultValue: 'Upload' }))}</span>
          </div>
          <div className="context-menu-item" onClick={() => { onEdit(item); onClose(); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.854 2.854a.5.5 0 0 0-.708 0L11 4l1 1 1.146-1.146a.5.5 0 0 0 0-.708l-.292-.292zM10 5L5 10v1h1l5-5-1-1zM3 11.5V13h1.5l6.5-6.5-1.5-1.5L3 11.5z" />
            </svg>
            <span>{String(t('knowledgeBase.contextMenu.edit', { defaultValue: 'Edit Details' }))}</span>
          </div>
          <div className="context-menu-item" onClick={() => { onSettings?.(item); onClose(); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.292-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.292c.415.764-.42 1.6-1.185 1.184l-.292-.159a1.873 1.873 0 0 0-2.692 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.693-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.292A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
            </svg>
            <span>{String(t('knowledgeBase.contextMenu.settings', { defaultValue: 'Settings' }))}</span>
          </div>
        </>
      )}

      <div className="context-menu-divider" />

      <div className="context-menu-item context-menu-item--danger" onClick={() => { onDelete(item); onClose(); }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
          <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
        </svg>
        <span>
          {String(t('knowledgeBase.contextMenu.delete', {
            defaultValue: 'Delete {{type}}',
            type: itemType,
          }))}
        </span>
      </div>
    </div>
  );
};
