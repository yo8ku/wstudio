/**
 * Activity bar context menu.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useActivityBarStore } from '../../../stores/activityBarStore';
import { Icon } from '../../Icons';
import './ActivityBarContextMenu.scss';

export interface ActivityBarContextMenuProps {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly onClose: () => void;
}

export const ActivityBarContextMenu: React.FC<ActivityBarContextMenuProps> = ({
  visible,
  x,
  y,
  onClose,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    visibility,
    sidebarPosition,
    toggleVisibility,
    toggleSidebarPosition,
  } = useActivityBarStore();
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));

  const menuItems: Array<{ id: keyof typeof visibility; label: string; checked: boolean }> = [
    { id: 'explorer', label: translateText('sidebar.titles.explorer', 'Explorer'), checked: visibility.explorer },
    { id: 'search', label: translateText('sidebar.titles.search', 'Search'), checked: visibility.search },
    { id: 'extensions', label: translateText('sidebar.titles.extensions', 'Extensions'), checked: visibility.extensions },
    { id: 'knowledgeBase', label: translateText('sidebar.titles.knowledgeBase', 'Knowledge Base'), checked: visibility.knowledgeBase },
    { id: 'aiModel', label: translateText('sidebar.titles.aiModel', 'AI Models'), checked: visibility.aiModel },
    { id: 'media', label: translateText('sidebar.titles.media', 'Media Library'), checked: visibility.media },
  ];
  const toggleSidebarLabel = sidebarPosition === 'left'
    ? translateText('sidebar.activityBarContextMenu.moveSidebarRight', 'Move Primary Sidebar Right')
    : translateText('sidebar.activityBarContextMenu.moveSidebarLeft', 'Move Primary Sidebar Left');

  useEffect(() => {
    if (visible && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menu.style.left = `${Math.max(10, adjustedX)}px`;
      menu.style.top = `${Math.max(10, adjustedY)}px`;
    }
  }, [visible, x, y]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) {
    return null;
  }

  const menuContent = (
    <div
      ref={menuRef}
      className="activity-bar-context-menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {menuItems.map(item => (
        <div
          key={item.id}
          className="activity-bar-context-menu-item"
          onClick={() => toggleVisibility(item.id)}
        >
          <div className="activity-bar-context-menu-item-icon">
            {item.checked && <Icon name="check" size={16} />}
          </div>
          <div className="activity-bar-context-menu-item-label">{item.label}</div>
        </div>
      ))}

      <div className="activity-bar-context-menu-separator" />

      <div
        className="activity-bar-context-menu-item"
        onClick={() => {
          toggleSidebarPosition();
          onClose();
        }}
      >
        <div className="activity-bar-context-menu-item-icon" />
        <div className="activity-bar-context-menu-item-label">
          {toggleSidebarLabel}
        </div>
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
};
