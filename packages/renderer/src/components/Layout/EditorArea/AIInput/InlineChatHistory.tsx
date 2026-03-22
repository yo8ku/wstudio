/**
 * 内联聊天历史记录组件
 * 显示内联聊天的历史对话列表，支持加载历史会话
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../../Icons/Icon';
import { inlineChatHistoryService, type InlineChatSession } from '../../../../services';
import './InlineChatHistory.scss';

interface InlineChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  buttonRef: HTMLButtonElement | null;
  currentFileUri?: string; // 当前文件 URI，用于筛选
  displayMode?: 'floating' | 'fixed'; // 显示模式：浮动弹窗 or 固定侧边栏
  fixedPosition?: { x: number; y: number; width: number; height: number }; // 固定模式的位置信息
}

export const InlineChatHistory: React.FC<InlineChatHistoryProps> = ({ 
  isOpen, 
  onClose, 
  onSelectSession, 
  buttonRef,
  currentFileUri,
  displayMode = 'floating',
  fixedPosition
}) => {
  const [sessions, setSessions] = useState<InlineChatSession[]>([]);
  const [sessionTitles, setSessionTitles] = useState<Map<string, string>>(new Map()); // 存储每个会话的第一条问题
  const [isLoading, setIsLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [maxHeight, setMaxHeight] = useState(400);
  const [filterMode, setFilterMode] = useState<'all' | 'current'>('current'); // 筛选模式
  const [isPositionReady, setIsPositionReady] = useState(false); // 位置是否已计算完成
  const menuRef = React.useRef<HTMLDivElement>(null);

  // 计算菜单位置和最大高度（仅在浮动模式）
  useEffect(() => {
    if (isOpen && displayMode === 'floating' && buttonRef) {
      // 重置位置就绪状态，在位置计算完成前隐藏菜单
      setIsPositionReady(false);
      
      const rect = buttonRef.getBoundingClientRect();
      const menuWidth = 350; // 菜单宽度
      const spacing = 8; // 距离窗口底部和边缘的间距
      
      // 计算可用的垂直空间
      const availableHeight = window.innerHeight - rect.bottom - spacing;
      const calculatedMaxHeight = Math.max(200, Math.min(500, availableHeight - spacing));
      
      // 菜单位置：按钮左下角，确保不超出窗口边界
      let menuX = rect.left;
      // 如果菜单会超出右边界，则调整到不超出
      if (menuX + menuWidth > window.innerWidth - spacing) {
        menuX = window.innerWidth - menuWidth - spacing;
      }
      // 确保菜单不超出左边界
      menuX = Math.max(spacing, menuX);
      
      setMenuPosition({
        x: menuX,
        y: rect.bottom + 4
      });
      
      setMaxHeight(calculatedMaxHeight);
      
      // 使用 requestAnimationFrame 确保位置计算完成后再显示菜单
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsPositionReady(true);
        });
      });
    } else if (isOpen && displayMode === 'fixed') {
      // 固定模式：位置由 fixedPosition 提供，直接标记为就绪
      setIsPositionReady(true);
    } else {
      // 菜单关闭时重置位置就绪状态
      setIsPositionReady(false);
    }
  }, [isOpen, buttonRef, displayMode]);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('[InlineChatHistory] 开始加载会话列表, filterMode:', filterMode, 'currentFileUri:', currentFileUri);
      
      // 初始化数据库
      await inlineChatHistoryService.initialize();
      console.log('[InlineChatHistory] 数据库初始化成功');
      
      // 根据筛选模式查询
      const query = filterMode === 'current' && currentFileUri 
        ? { fileUri: currentFileUri, limit: 50 }
        : { limit: 50 };
      
      console.log('[InlineChatHistory] 查询参数:', JSON.stringify(query, null, 2));
      console.log('[InlineChatHistory] currentFileUri 值:', currentFileUri);
      console.log('[InlineChatHistory] currentFileUri 类型:', typeof currentFileUri);
      console.log('[InlineChatHistory] currentFileUri 长度:', currentFileUri?.length);
      
      const sessionList = await inlineChatHistoryService.querySessions(query);
      
      console.log('[InlineChatHistory] 加载会话列表成功:', sessionList.length, '个');
      if (sessionList.length > 0) {
        console.log('[InlineChatHistory] 会话详情:', sessionList.map(s => ({
          id: s.id,
          fileUri: s.fileUri,
          lineNumber: s.lineNumber,
          title: s.title,
          messageCount: s.messageCount,
          updatedAt: new Date(s.updatedAt).toISOString()
        })));
      } else {
        console.warn('[InlineChatHistory] ⚠️ 未找到任何会话，可能的原因：');
        console.warn('[InlineChatHistory] 1. 数据库中没有数据');
        console.warn('[InlineChatHistory] 2. fileUri 不匹配（查询:', currentFileUri, '）');
        console.warn('[InlineChatHistory] 3. 数据库查询条件有问题');
      }
      setSessions(sessionList);
      
      // 为每个会话加载第一条用户消息作为标题
      const titles = new Map<string, string>();
      for (const session of sessionList) {
        try {
          const messages = await inlineChatHistoryService.getMessages(session.id);
          if (messages && messages.length > 0) {
            // 找到第一条用户消息
            const firstUserMessage = messages.find(msg => msg.role === 'user');
            if (firstUserMessage) {
              // 截取前50个字符作为标题
              const title = firstUserMessage.content.length > 50 
                ? firstUserMessage.content.substring(0, 50) + '...'
                : firstUserMessage.content;
              titles.set(session.id, title);
            }
          }
        } catch (error) {
          console.error(`[InlineChatHistory] 获取会话 ${session.id} 的第一条消息失败:`, error);
          // 如果获取失败，使用会话的原始标题
          if (session.title) {
            titles.set(session.id, session.title);
          }
        }
      }
      setSessionTitles(titles);
      console.log('[InlineChatHistory] 会话标题:', Array.from(titles.entries()));
    } catch (error) {
      console.error('[InlineChatHistory] 加载会话失败:', error);
      console.error('[InlineChatHistory] 错误详情:', error instanceof Error ? error.message : String(error));
      console.error('[InlineChatHistory] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [filterMode, currentFileUri]);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  // 点击外部关闭菜单（仅在浮动模式）
  useEffect(() => {
    if (!isOpen || displayMode === 'fixed') return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // 如果点击的是按钮本身，不关闭（由按钮的点击事件处理）
      if (buttonRef && buttonRef.contains(target)) {
        return;
      }
      
      // 如果点击的是菜单内部，不关闭
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      
      // 点击外部，关闭菜单
      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
  }, [isOpen, onClose, buttonRef, displayMode]);

  // 选择会话
  const handleSelectSession = (sessionId: string) => {
    console.log('[InlineChatHistory] 选择会话:', sessionId);
    onSelectSession(sessionId);
    onClose();
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await inlineChatHistoryService.deleteSession(sessionId);
      console.log('[InlineChatHistory] 删除会话成功:', sessionId);
      
      // 重新加载列表
      await loadSessions();
    } catch (error) {
      console.error('[InlineChatHistory] 删除会话失败:', error);
    }
  };

  // 清空当前文件历史
  const handleClearCurrentFile = async () => {
    if (!currentFileUri) return;
    
    const confirmed = window.confirm('确定要清空当前文件的所有历史记录吗？');
    if (!confirmed) return;
    
    try {
      await inlineChatHistoryService.clearFileHistory(currentFileUri);
      console.log('[InlineChatHistory] 清空文件历史成功');
      
      // 重新加载列表
      await loadSessions();
    } catch (error) {
      console.error('[InlineChatHistory] 清空文件历史失败:', error);
    }
  };

  // 切换筛选模式
  const handleToggleFilter = () => {
    setFilterMode(prev => prev === 'current' ? 'all' : 'current');
  };

  if (!isOpen) return null;

  // 根据显示模式确定样式
  const getContainerStyle = () => {
    const baseStyle: React.CSSProperties = {
      opacity: isPositionReady ? 1 : 0,
      visibility: isPositionReady ? 'visible' : 'hidden',
    };
    
    if (displayMode === 'fixed' && fixedPosition) {
      return {
        ...baseStyle,
        position: 'absolute' as const,
        left: `${fixedPosition.x}px`,
        top: `${fixedPosition.y}px`,
        width: `${fixedPosition.width}px`,
        height: `${fixedPosition.height}px`,
        maxHeight: 'none',
        zIndex: 1002 // 略高于 Zone Widget 边框 (1001)
      };
    }
    
    // 浮动模式
    return {
      ...baseStyle,
      position: 'fixed' as const,
      left: `${menuPosition.x}px`,
      top: `${menuPosition.y}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: 10000
    };
  };

  return (
    <div 
      ref={menuRef}
      className={`inline-chat-history-menu ${displayMode === 'fixed' ? 'fixed-mode' : 'floating-mode'}`}
      style={getContainerStyle()}
    >
      <div className="inline-chat-history-header">
        <span>历史记录</span>
        <div className="header-actions">
          {currentFileUri && (
            <button
              className="filter-button"
              onClick={handleToggleFilter}
              title={filterMode === 'current' ? '显示所有文件' : '只显示当前文件'}
            >
              <Icon 
                name={filterMode === 'current' ? 'file' : 'folder'} 
                size={14} 
                iconSet="ui" 
              />
            </button>
          )}
          {currentFileUri && filterMode === 'current' && sessions.length > 0 && (
            <button
              className="clear-button"
              onClick={handleClearCurrentFile}
              title="清空当前文件历史"
            >
              <Icon name="delete" size={14} iconSet="ui" />
            </button>
          )}
        </div>
      </div>

      <div className="inline-chat-history-content">
        {isLoading ? (
          <div className="loading-state">
            <span>加载中...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <Icon name="history" size={32} iconSet="ui" />
            <span>暂无历史记录</span>
            {filterMode === 'current' && (
              <button className="show-all-button" onClick={handleToggleFilter}>
                查看所有文件
              </button>
            )}
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
                    {sessionTitles.get(session.id) || session.title || '无标题'}
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

