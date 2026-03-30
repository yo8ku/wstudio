/**
 * Assistant 消息文本选择右键菜单组件
 * 功能：为 assistant 消息提供文本选择后的右键菜单
 * 描述：支持插入到文档、复制等功能
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icons';
import './AssistantTextContextMenu.scss';

export interface AssistantTextContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  onClose: () => void;
  onInsertToDocument: (text: string) => void;
  onCopy: (text: string) => void;
  onAddToChat: (text: string) => void;
  onInsertToInlineEdit: (text: string) => void;
}

export const AssistantTextContextMenu: React.FC<AssistantTextContextMenuProps> = ({
  visible,
  x,
  y,
  selectedText,
  onClose,
  onInsertToDocument,
  onCopy,
  onAddToChat,
  onInsertToInlineEdit
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));

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

    // 延迟添加事件监听，避免立即触发
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  // 调整菜单位置，避免超出屏幕
  useEffect(() => {
    if (!visible || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // 如果菜单超出右边界，向左调整
    if (rect.right > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }

    // 如果菜单超出底部边界，向上调整
    if (rect.bottom > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [visible, x, y]);

  if (!visible) return null;

  const handleInsertToDocument = () => {
    onInsertToDocument(selectedText);
    onClose();
  };

  const handleCopy = () => {
    onCopy(selectedText);
    onClose();
  };

  const handleAddToChat = () => {
    onAddToChat(selectedText);
    onClose();
  };

  const handleInsertToInlineEdit = () => {
    onInsertToInlineEdit(selectedText);
    onClose();
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="assistant-text-context-menu menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="assistant-text-context-menu-item"
        onClick={handleInsertToDocument}
      >
        <div className="assistant-text-context-menu-item-icon">
          <svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor">
            <path d="M143.36 960a30.72 30.72 0 0 1-31.9488-29.4912 10.24 10.24 0 0 1 0-2.56V96.0512a30.72 30.72 0 0 1 29.3888-32.0512h706.56a30.72 30.72 0 0 1 32.256 29.5936 10.24 10.24 0 0 1 0 2.4576v394.6496h-63.8976V128h-640v768h321.7408v64z m504.32-83.2512l-128-128a31.4368 31.4368 0 0 1-1.6384-44.3392l1.6384-1.6384 127.8976-128a30.72 30.72 0 0 1 30.72-7.4752 29.9008 29.9008 0 0 1 22.528 22.016 30.72 30.72 0 0 1-7.9872 31.5392l-74.0352 72.9088h260.096A32.0512 32.0512 0 1 1 881.664 757.76H618.9056l74.0352 72.9088a30.72 30.72 0 0 1 7.9872 31.5392 29.7984 29.7984 0 0 1-22.528 22.016 35.0208 35.0208 0 0 1-9.216 1.2288 30.72 30.72 0 0 1-21.2992-8.704zM303.7184 488.1408v-64.1024h263.9872v64.1024z m0-188.3136V235.52h384v64z" />
          </svg>
        </div>
        <div className="assistant-text-context-menu-item-label">
          {translateText('aiChatPanel.assistantTextContextMenu.insertToDocument', 'Insert into Document')}
        </div>
      </div>

      <div
        className="assistant-text-context-menu-item"
        onClick={handleInsertToInlineEdit}
      >
        <div className="assistant-text-context-menu-item-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M14 3H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h2v2l2-2h8c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zm0 9H5.5L4 13.5V12H2V4h12v8z"/>
            <circle cx="5" cy="8" r=".75"/>
            <circle cx="8" cy="8" r=".75"/>
            <circle cx="11" cy="8" r=".75"/>
          </svg>
        </div>
        <div className="assistant-text-context-menu-item-label">
          {translateText('aiChatPanel.assistantTextContextMenu.insertToInlineEdit', 'Insert into Inline Edit')}
        </div>
      </div>

      <div
        className="assistant-text-context-menu-item"
        onClick={handleAddToChat}
      >
        <div className="assistant-text-context-menu-item-icon">
          <svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor">
            <path d="M853.333333 631.637333V307.072c0-24.533333 0-40.405333-0.981333-52.48-0.981333-11.562667-2.56-15.872-3.626667-17.962667a42.709333 42.709333 0 0 0-18.688-18.645333c-2.133333-1.066667-6.4-2.645333-18.005333-3.626667A722.773333 722.773333 0 0 0 759.466667 213.333333H264.533333c-24.576 0-40.490667 0.042667-52.565333 1.024-11.605333 0.981333-15.914667 2.56-18.005333 3.626667a42.581333 42.581333 0 0 0-18.645334 18.645333c-1.066667 2.133333-2.645333 6.4-3.626666 18.005334C170.709333 266.666667 170.666667 282.624 170.666667 307.2v489.386667c0 23.594667 0.042667 38.357333 0.981333 48.768l0.256 1.834666c0.512-0.298667 1.109333-0.512 1.706667-0.896 8.704-5.802667 20.224-14.933333 38.656-29.653333l65.024-52.053333 0.170666-0.128c12.373333-9.941333 23.125333-18.773333 35.584-25.130667l7.850667-3.669333c7.936-3.413333 16.213333-5.973333 24.661333-7.68 13.653333-2.816 27.648-2.645333 43.690667-2.645334h370.346667c24.576 0 40.405333 0 52.48-0.981333 11.562667-0.981333 15.872-2.56 17.962666-3.626667 8.021333-4.096 14.592-10.666667 18.688-18.688 1.066667-2.133333 2.645333-6.4 3.626667-17.92 0.981333-12.074667 0.981333-27.946667 0.981333-52.48zM469.333333 597.333333v-85.333333H384a42.666667 42.666667 0 1 1 0-85.333333h85.333333V341.333333a42.666667 42.666667 0 1 1 85.333334 0v85.333334h85.333333a42.666667 42.666667 0 1 1 0 85.333333h-85.333333v85.333333a42.666667 42.666667 0 1 1-85.333334 0z m469.333334 34.304c0 23.125333 0.042667 43.093333-1.28 59.392-1.408 16.853333-4.437333 33.621333-12.672 49.749334a128.042667 128.042667 0 0 1-55.893334 55.893333c-16.170667 8.277333-32.938667 11.306667-49.792 12.714667-16.341333 1.322667-36.266667 1.28-59.392 1.28h-370.346666c-19.498667 0-23.338667 0.170667-26.624 0.853333h0.042666a42.666667 42.666667 0 0 0-10.837333 3.84c-2.986667 1.493333-6.058667 3.712-21.12 15.786667l-0.170667 0.085333-64.981333 52.053333c-17.066667 13.653333-32.213333 25.770667-44.970667 34.218667-12.074667 7.978667-29.226667 17.706667-49.877333 17.749333-26.026667 0-50.602667-11.818667-66.773333-32.128-12.885333-16.170667-16-35.584-17.322667-50.005333C85.333333 837.888 85.333333 818.517333 85.333333 796.629333V307.2c0-23.210667-0.042667-43.221333 1.28-59.562667 1.408-16.896 4.437333-33.664 12.672-49.792a127.957333 127.957333 0 0 1 55.893334-55.893333c16.170667-8.277333 32.938667-11.306667 49.834666-12.714667C221.354667 128 241.365333 128 264.533333 128h494.933334c23.168 0 43.178667-0.042667 59.52 1.28 16.896 1.408 33.664 4.437333 49.792 12.672a128 128 0 0 1 55.893333 55.893333c8.277333 16.170667 11.306667 32.938667 12.714667 49.792 1.322667 16.341333 1.28 36.266667 1.28 59.434667v324.565333z" />
          </svg>
        </div>
        <div className="assistant-text-context-menu-item-label">
          {translateText('aiChatPanel.assistantTextContextMenu.addToChat', 'Add to Chat')}
        </div>
      </div>

      <div className="assistant-text-context-menu-separator" />

      <div
        className="assistant-text-context-menu-item"
        onClick={handleCopy}
      >
        <div className="assistant-text-context-menu-item-icon">
          <Icon name="copy" size={16} />
        </div>
        <div className="assistant-text-context-menu-item-label">
          {translateText('aiChatPanel.assistantTextContextMenu.copy', 'Copy')}
        </div>
      </div>
    </div>
  );

  // 使用 Portal 渲染到 body，避免被父容器裁剪
  return createPortal(menuContent, document.body);
};

export default AssistantTextContextMenu;

