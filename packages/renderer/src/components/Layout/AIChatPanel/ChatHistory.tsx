/**
 * 聊天历史记录组件
 * 显示历史对话列表，支持加载历史会话
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../../Icons/Icon';
import { modal, useModalStore } from '../../../stores/modalStore';
import type { ChatSessionData } from '../../../types/electron';
import './ChatHistory.scss';

interface ChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ isOpen, onClose, onSelectSession, buttonRef }) => {
  const [sessions, setSessions] = useState<ChatSessionData[]>([]);
  const [sessionTitles, setSessionTitles] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [maxHeight, setMaxHeight] = useState(400);
  const menuRef = React.useRef<HTMLDivElement>(null);
  
  // 订阅全局模态窗口状态
  const isModalOpen = useModalStore((state) => state.isOpen);

  // 计算下拉菜单位置和最大高度（避免溢出窗口）
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 300; // 菜单宽度
      const spacing = 8; // 距离窗口底部和边缘的间距

      const minX = spacing;
      const maxX = Math.max(spacing, window.innerWidth - menuWidth - spacing);
      const menuX = Math.min(Math.max(rect.left, minX), maxX);
      const menuY = rect.bottom + 6;
      const availableHeight = window.innerHeight - menuY - spacing;
      const calculatedMaxHeight = Math.max(200, Math.min(500, availableHeight));

      setMenuPosition({
        x: menuX,
        y: menuY
      });

      setMaxHeight(calculatedMaxHeight);
    }
  }, [isOpen, buttonRef]);

  // 加载会话列表
  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.chatHistory?.getSessions();
      console.log('[ChatHistory] 获取会话列表结果:', result);
      if (result?.success && result.data) {
        console.log('[ChatHistory] 会话数量:', result.data.length);
        setSessions(result.data);
        
        // 为每个会话加载第一条消息作为标题
        const titles = new Map<string, string>();
        for (const session of result.data) {
          const messagesResult = await window.electronAPI?.chatHistory?.getMessages(session.id);
          if (messagesResult?.success && messagesResult.data && messagesResult.data.length > 0) {
            // 找到第一条用户消息
            const firstUserMessage = messagesResult.data.find(msg => msg.role === 'user');
            if (firstUserMessage) {
              // 截取前50个字符作为标题
              const title = firstUserMessage.content.length > 50 
                ? firstUserMessage.content.substring(0, 50) + '...'
                : firstUserMessage.content;
              titles.set(session.id, title);
            }
          }
        }
        setSessionTitles(titles);
        console.log('[ChatHistory] 会话标题:', titles);
      }
    } catch (error) {
      console.error('[ChatHistory] 加载会话失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    console.log('[ChatHistory] 选择会话:', sessionId);
    onSelectSession(sessionId);
    // 不在这里关闭菜单，由父组件的 loadHistorySession 函数负责关闭
  };

  const handleDeleteSession = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    console.log('[ChatHistory] 点击删除按钮，会话ID:', sessionId);
    
    // 使用全局模态窗口
    modal.confirm({
      title: '删除对话',
      description: '确定要删除这个对话吗？删除后将无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          const result = await window.electronAPI?.chatHistory?.deleteSession(sessionId);
          if (result?.success) {
            console.log('[ChatHistory] 删除会话成功:', sessionId);
            // 重新加载会话列表
            loadSessions();
          }
        } catch (error) {
          console.error('[ChatHistory] 删除会话失败:', error);
        }
      },
    });
  };

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // 如果模态窗口打开，完全禁用点击外部关闭功能
      if (isModalOpen) {
        console.log('[ChatHistory] 模态窗口打开中，禁用点击外部关闭');
        return;
      }
      
      const target = event.target as HTMLElement;
      
      // 检查是否点击了模态窗口相关元素（双重保险）
      const isClickInsideModal = target.closest('.alert-dialog-content') ||
                                 target.closest('[role="alertdialog"]') ||
                                 target.closest('[data-radix-alert-dialog-content]');
      
      // 如果点击了模态窗口相关元素，不要关闭历史记录菜单
      if (isClickInsideModal) {
        console.log('[ChatHistory] 点击了模态窗口，保持菜单打开');
        return;
      }
      
      // 只有当点击不在菜单内且不在按钮内时，才关闭菜单
      const isClickInsideMenu = menuRef.current?.contains(target);
      const isClickInsideButton = buttonRef.current?.contains(target);
      
      if (!isClickInsideMenu && !isClickInsideButton) {
        console.log('[ChatHistory] 点击了外部区域，关闭菜单');
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      // 如果模态窗口打开，ESC 键不关闭历史记录菜单（让模态窗口处理）
      if (isModalOpen) {
        console.log('[ChatHistory] 模态窗口打开中，ESC由模态窗口处理');
        return;
      }
      
      if (e.key === 'Escape') {
        console.log('[ChatHistory] 按下ESC，关闭菜单');
        onClose();
      }
    };

    // 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, buttonRef, isModalOpen]); // 添加 isModalOpen 到依赖项

  if (!isOpen) return null;

  return (
    <div 
      ref={menuRef}
      className="chat-history-menu"
      style={{
        position: 'fixed',
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
        maxHeight: `${maxHeight}px`,
        zIndex: 1000
      }}
    >
      <div className="chat-history-header">
        <span>历史记录</span>
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
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="session-item"
                onClick={() => handleSelectSession(session.id)}
              >
                <div className="session-content">
                  <div className="session-title">
                    {sessionTitles.get(session.id) || '新对话'}
                  </div>
                </div>
                <button
                  className="delete-button"
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  title="删除对话"
                >
                  <Icon name="delete" size={16} iconSet="ui" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

