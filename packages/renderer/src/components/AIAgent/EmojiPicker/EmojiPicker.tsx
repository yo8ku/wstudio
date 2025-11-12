/**
 * Emoji 选择器组件
 * 功能：提供Emoji选择界面，支持分类浏览和搜索
 * 描述：使用emoji-mart库提供的Emoji选择器，下拉框使用Portal渲染到body
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import './EmojiPicker.scss';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 更新下拉框位置
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 修改 emoji-mart Shadow DOM 内的滚动条样式和分类选中状态
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;

    // 等待 emoji-mart 渲染完成
    const timer = setTimeout(() => {
      const emojiPicker = dropdownRef.current?.querySelector('em-emoji-picker');
      if (emojiPicker && emojiPicker.shadowRoot) {
        // 注入自定义样式到 Shadow DOM
        const style = document.createElement('style');
        style.textContent = `
          /* 滚动条样式 */
          ::-webkit-scrollbar {
            width: 4px !important;
            height: 4px !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background-color: rgba(255, 255, 255, 0.2) !important;
            border-radius: 2px !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background-color: rgba(255, 255, 255, 0.3) !important;
          }
          * {
            scrollbar-width: thin !important;
            scrollbar-color: rgba(255, 255, 255, 0.2) transparent !important;
          }


          /* 搜索框高度 */
          .search input[type="search"]{
            height:30px !important;
          }

          /* 顶部导航栏背景色，下边框 */
          #nav{
            border-bottom: 1px solid var(--ws-activitybar-foreground);
          }

          /* 分类按钮基础样式 */
          #nav button {
            transition: background-color 0.15s ease !important;
          }

          /* 分类按钮悬停状态 */
          #nav button:hover {
            background-color: var(--color-border-over) !important;
          }

          /* 分类按钮选中状态 */
          #nav button[aria-selected="true"],
          #nav button.active {
            background-color: var(--ws-list-active-selection-background) !important;
            opacity: 1 !important;
          }

          /* 分类按钮选中且悬停状态 */
          #nav button[aria-selected="true"]:hover,
          #nav button.active:hover {
            background-color: var(--ws-list-active-selection-background) !important;
            filter: brightness(1.2) !important;
          }

        `;
        emojiPicker.shadowRoot.appendChild(style);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleSelect = (emoji: any) => {
    onChange(emoji.native);
    setIsOpen(false);
  };

  return (
    <>
      <div className="emoji-picker">
        <button
          ref={triggerRef}
          type="button"
          className="emoji-picker-trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          {value || '选择'}
        </button>
      </div>
      
      {isOpen && createPortal(
        <div 
          className="emoji-picker-dropdown emoji-picker-dropdown--portal" 
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          <Picker
            data={data}
            onEmojiSelect={handleSelect}
            locale="zh"
            previewPosition="none"
            skinTonePosition="none"
            theme="dark"
            set="native"
          />
        </div>,
        document.body
      )}
    </>
  );
};

