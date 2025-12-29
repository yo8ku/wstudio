/**
 * 视频链接输入组件
 * 功能：提供视频链接输入弹窗，支持输入视频URL
 * 描述：点击右键菜单"视频链接"时显示，用户可输入视频链接地址
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './VideoLinkInput.scss';

export interface VideoLinkInputProps {
  /** 是否显示 */
  visible: boolean;
  /** 显示位置 X */
  x: number;
  /** 显示位置 Y */
  y: number;
  /** 确认回调，返回 url */
  onConfirm: (url: string) => void;
  /** 关闭回调 */
  onClose: () => void;
}

export const VideoLinkInput: React.FC<VideoLinkInputProps> = ({
  visible,
  x,
  y,
  onConfirm,
  onClose,
}) => {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // 调整位置，防止超出视口
  useEffect(() => {
    if (visible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (y + rect.height > viewportHeight - 28) {
        adjustedY = viewportHeight - rect.height - 38;
      }

      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [visible, x, y]);

  // 显示时聚焦输入框
  useEffect(() => {
    if (visible) {
      setUrl('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [visible]);

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  // 处理确认
  const handleConfirm = useCallback(() => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    onConfirm(trimmedUrl);
    onClose();
  }, [url, onConfirm, onClose]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    },
    [handleConfirm]
  );

  // 打开示例链接
  const handleViewExample = useCallback(() => {
    window.open('https://www.bilibili.com', '_blank');
  }, []);

  if (!visible) {
    return null;
  }

  const content = (
    <div
      ref={containerRef}
      className="video-link-input"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <input
        ref={inputRef}
        type="text"
        className="video-link-input__field"
        placeholder="粘贴哔哩哔哩链接，如 https://www.bilibili.com..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="video-link-input__actions">
        <span className="video-link-input__example" onClick={handleViewExample}>
          查看示例
        </span>
        <span
          className={`video-link-input__confirm ${!url.trim() ? 'disabled' : ''}`}
          onClick={handleConfirm}
        >
          确定
        </span>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
