/**
 * 聊天历史记录组件。
 * 显示历史会话列表，支持搜索、切换和删除会话。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../Icons/Icon';
import { modal, useModalStore } from '../../../stores/modalStore';
import type { ChatSessionData } from '../../../types/electron';
import { PressableControl } from './PressableControl';
import {
  DEFAULT_CHAT_SESSION_TITLE,
  getChatSessionTitle,
  truncateChatSessionTitle,
} from './chatSessionTitle';
import './ChatHistory.scss';

interface ChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  buttonRef: React.RefObject<HTMLDivElement>;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  isOpen,
  onClose,
  onSelectSession,
  buttonRef,
}) => {
  const [sessions, setSessions] = useState<ChatSessionData[]>([]);
  const [sessionTitles, setSessionTitles] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [maxHeight, setMaxHeight] = useState(400);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const isModalOpen = useModalStore((state) => state.isOpen);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 300;
    const spacing = 8;
    const minX = spacing;
    const maxX = Math.max(spacing, window.innerWidth - menuWidth - spacing);
    const menuX = Math.min(Math.max(rect.left, minX), maxX);
    const menuY = rect.bottom + 6;
    const availableHeight = window.innerHeight - menuY - spacing;

    setMenuPosition({
      x: menuX,
      y: menuY,
    });
    setMaxHeight(Math.max(200, Math.min(500, availableHeight)));
  }, [buttonRef, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchQuery('');
    void loadSessions();
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [isOpen]);

  const loadSessions = async () => {
    setIsLoading(true);

    try {
      const result = await window.electronAPI?.chatHistory?.getSessions();

      if (!result?.success || !result.data) {
        return;
      }

      setSessions(result.data);

      const titles = new Map<string, string>();
      for (const session of result.data) {
        const messagesResult = await window.electronAPI?.chatHistory?.getMessages(session.id);
        if (!messagesResult?.success || !messagesResult.data?.length) {
          continue;
        }

        const firstUserMessage = messagesResult.data.find((message) => message.role === 'user');
        if (firstUserMessage) {
          titles.set(session.id, getChatSessionTitle(firstUserMessage.content));
        }
      }

      setSessionTitles(titles);
    } catch (error) {
      console.error('[ChatHistory] 加载会话失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return sessions;
    }

    return sessions.filter((session) => {
      const title = (sessionTitles.get(session.id) || DEFAULT_CHAT_SESSION_TITLE).toLowerCase();
      return title.includes(normalizedQuery);
    });
  }, [searchQuery, sessionTitles, sessions]);

  const handleSelectSession = (sessionId: string) => {
    onSelectSession(sessionId);
  };

  const handleDeleteSession = (
    sessionId: string,
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();

    modal.confirm({
      title: '删除对话',
      description: '确定要删除这段对话吗？删除后将无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          const result = await window.electronAPI?.chatHistory?.deleteSession(sessionId);
          if (result?.success) {
            await loadSessions();
          }
        } catch (error) {
          console.error('[ChatHistory] 删除会话失败:', error);
        }
      },
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (isModalOpen) {
        return;
      }

      const target = event.target as HTMLElement;
      const isClickInsideModal =
        target.closest('.alert-dialog-content') ||
        target.closest('[role="alertdialog"]') ||
        target.closest('[data-radix-alert-dialog-content]');

      if (isClickInsideModal) {
        return;
      }

      const isClickInsideMenu = menuRef.current?.contains(target);
      const isClickInsideButton = buttonRef.current?.contains(target);

      if (!isClickInsideMenu && !isClickInsideButton) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (isModalOpen) {
        return;
      }

      if (event.key === 'Escape') {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [buttonRef, isModalOpen, isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="chat-history-menu"
      style={{
        position: 'fixed',
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
        maxHeight: `${maxHeight}px`,
        zIndex: 1000,
      }}
    >
      <div className="chat-history-header">
        <input
          ref={searchInputRef}
          className="chat-history-search-input"
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索历史记录"
        />
      </div>

      <div className="chat-history-content">
        {isLoading ? (
          <div className="loading-state">
            <span>加载中...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <span>暂无历史记录</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="empty-state">
            <span>未找到匹配的历史记录</span>
          </div>
        ) : (
          <div className="session-list">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                className="session-item"
                onClick={() => handleSelectSession(session.id)}
              >
                <div className="session-content">
                  <div className="session-title">
                    {truncateChatSessionTitle(
                      sessionTitles.get(session.id) || DEFAULT_CHAT_SESSION_TITLE,
                      50
                    )}
                  </div>
                </div>
                <PressableControl
                  className="delete-button"
                  onPress={(event) => handleDeleteSession(session.id, event)}
                  title="删除对话"
                >
                  <Icon name="delete" size={16} iconSet="ui" />
                </PressableControl>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
