/**
 * 活动栏右键菜单组件
 * 功能：为活动栏提供右键菜单，控制各项的显示/隐藏和侧栏位置
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useActivityBarStore } from '../../../stores/activityBarStore';
import { Icon } from '../../Icons';
import './ActivityBarContextMenu.scss';

export interface ActivityBarContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
}

export const ActivityBarContextMenu: React.FC<ActivityBarContextMenuProps> = ({
  visible,
  x,
  y,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { visibility, sidebarPosition, toggleVisibility, toggleSidebarPosition } = useActivityBarStore();

  // 菜单项配置
  const menuItems = [
    {
      id: 'explorer',
      label: '资源管理器',
      checked: visibility.explorer,
    },
    {
      id: 'search',
      label: '搜索',
      checked: visibility.search,
    },
    {
      id: 'sourceControl',
      label: '源代码管理',
      checked: visibility.sourceControl,
    },
    {
      id: 'extensions',
      label: '扩展',
      checked: visibility.extensions,
    },
    {
      id: 'knowledgeBase',
      label: '知识库',
      checked: visibility.knowledgeBase,
    },
    {
      id: 'aiModel',
      label: 'AI模型',
      checked: visibility.aiModel,
    },
  ];

  // 调整菜单位置，防止超出视图
  useEffect(() => {
    if (visible && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // 检查右边界
      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // 检查底部边界
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      // 确保不超出左边界和顶部边界
      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);

      menu.style.left = `${adjustedX}px`;
      menu.style.top = `${adjustedY}px`;
    }
  }, [visible, x, y]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // 延迟添加监听器，避免立即触发关闭
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) {
    return null;
  }

  const handleItemClick = (itemId: string) => {
    toggleVisibility(itemId as keyof typeof visibility);
  };

  const handleToggleSidebarPosition = () => {
    toggleSidebarPosition();
    onClose();
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="activity-bar-context-menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {menuItems.map((item) => (
        <div
          key={item.id}
          className="activity-bar-context-menu-item"
          onClick={() => handleItemClick(item.id)}
        >
          <div className="activity-bar-context-menu-item-icon">
            {item.checked && <Icon name="check" size={16} />}
          </div>
          <div className="activity-bar-context-menu-item-label">
            {item.label}
          </div>
        </div>
      ))}
      
      <div className="activity-bar-context-menu-separator" />
      
      <div
        className="activity-bar-context-menu-item"
        onClick={handleToggleSidebarPosition}
      >
        <div className="activity-bar-context-menu-item-icon"></div>
        <div className="activity-bar-context-menu-item-label">
          {sidebarPosition === 'left' ? '向右移动主侧栏' : '向左移动主侧栏'}
        </div>
      </div>
    </div>
  );

  // 使用 Portal 渲染到 body，避免被父容器裁剪
  return createPortal(menuContent, document.body);
};

