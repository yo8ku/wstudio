/**
 * 聊天历史记录组件。
 * 显示历史会话列表，支持搜索、切换和删除会话。
 */

import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../Icons/Icon';
import { modal, useModalStore } from '../../../stores/modalStore';
import type { ChatMessageData, ChatSessionData } from '../../../types/electron';
import {
  inlineChatHistoryService,
  type InlineChatMessage,
  type InlineChatQuery,
  type InlineChatSession,
} from '../../../services/InlineChatHistoryService';
import { PressableControl } from '../../common/PressableControl';
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
  source?: 'panel' | 'inline';
  inlineQuery?: InlineChatQuery;
}

type HistorySession = ChatSessionData | InlineChatSession;
type HistoryMessage = ChatMessageData | InlineChatMessage;
interface MenuPosition {
  x: number;
  y: number;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  isOpen,
  onClose,
  onSelectSession,
  buttonRef,
  source = 'panel',
  inlineQuery,
}) => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [sessionTitles, setSessionTitles] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [isPositionReady, setIsPositionReady] = useState(false);
  const [maxHeight, setMaxHeight] = useState(400);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const isModalOpen = useModalStore((state) => state.isOpen);
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));

  useLayoutEffect(() => {
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
    setIsPositionReady(true);
  }, [buttonRef, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsPositionReady(false);
      setMenuPosition(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchQuery('');
    void loadSessions();
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [
    inlineQuery?.fileUri,
    inlineQuery?.limit,
    inlineQuery?.lineNumber,
    inlineQuery?.offset,
    inlineQuery?.sessionId,
    isOpen,
    source,
  ]);

  const loadSessions = async () => {
    setIsLoading(true);

    try {
      const titles = new Map<string, string>();
      let nextSessions: HistorySession[] = [];

      if (source === 'inline') {
        nextSessions = await inlineChatHistoryService.querySessions(inlineQuery || {});

        for (const session of nextSessions) {
          const messages = await inlineChatHistoryService.getMessages(session.id);
          const firstUserMessage = messages.find((message: HistoryMessage) => message.role === 'user');
          if (firstUserMessage) {
            titles.set(session.id, getChatSessionTitle(firstUserMessage.content));
          }
        }
      } else {
        const result = await window.electronAPI?.chatHistory?.getSessions();

        if (!result?.success || !result.data) {
          return;
        }

        nextSessions = result.data;

        for (const session of result.data) {
          const messagesResult = await window.electronAPI?.chatHistory?.getMessages(session.id);
          if (!messagesResult?.success || !messagesResult.data?.length) {
            continue;
          }

          const firstUserMessage = messagesResult.data.find((message: HistoryMessage) => message.role === 'user');
          if (firstUserMessage) {
            titles.set(session.id, getChatSessionTitle(firstUserMessage.content));
          }
        }
      }

      setSessions(nextSessions);
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
      title: translateText('aiChatPanel.historyMenu.deleteDialog.title', 'Delete Conversation'),
      description: translateText(
        'aiChatPanel.historyMenu.deleteDialog.description',
        'Are you sure you want to delete this conversation? This action cannot be undone.',
      ),
      confirmText: translateText('aiChatPanel.historyMenu.deleteDialog.confirm', 'Delete'),
      cancelText: translateText('aiChatPanel.historyMenu.deleteDialog.cancel', 'Cancel'),
      onConfirm: async () => {
        try {
          if (source === 'inline') {
            await inlineChatHistoryService.deleteSession(sessionId);
            await loadSessions();
          } else {
            const result = await window.electronAPI?.chatHistory?.deleteSession(sessionId);
            if (result?.success) {
              await loadSessions();
            }
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

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
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
        left: `${menuPosition?.x ?? 0}px`,
        top: `${menuPosition?.y ?? 0}px`,
        maxHeight: `${maxHeight}px`,
        visibility: isPositionReady ? 'visible' : 'hidden',
        pointerEvents: isPositionReady ? 'auto' : 'none',
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
          placeholder={translateText('aiChatPanel.historyMenu.searchPlaceholder', 'Search history')}
        />
      </div>

      <div className="chat-history-content">
        {isLoading ? (
          <div className="loading-state">
            <span>{translateText('aiChatPanel.historyMenu.loading', 'Loading...')}</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <span>{translateText('aiChatPanel.historyMenu.empty', 'No history yet')}</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="empty-state">
            <span>{translateText('aiChatPanel.historyMenu.noResults', 'No matching history found')}</span>
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
                  title={translateText('aiChatPanel.historyMenu.deleteButtonTitle', 'Delete Conversation')}
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
