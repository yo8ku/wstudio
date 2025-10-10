/**
 * AI 对话面板组件
 */

import React, { useState, useRef, useEffect } from 'react';
import { builtinAI } from '../../services/BuiltinAIService';
import { Button } from '../ui/button';
import './AIChatPanel.scss';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  onClose: () => void;
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;
const COLLAPSE_THRESHOLD = 250; // 小于此宽度时自动收缩

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是 AI 助手，有什么可以帮助你的吗？',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 加载可用模型
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await builtinAI.getModels();
        setAvailableModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0]); // 默认选择第一个模型
        }
      } catch (error) {
        console.error('[AIChatPanel] 加载模型失败:', error);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 准备聊天历史（转换为 AI 服务需要的格式）
      const chatHistory = [...messages, userMessage].map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      }));

      // 创建临时的助手消息用于流式显示
      const tempAiMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: tempAiMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      }]);

      let accumulatedContent = '';

      // 使用流式聊天
      await builtinAI.streamChat(
        selectedModel || availableModels[0] || 'OpenAI:gpt-4o',
        chatHistory,
        {
          onChunk: (chunk: string) => {
            accumulatedContent += chunk;
            // 更新临时消息的内容
            setMessages(prev => prev.map(msg => 
              msg.id === tempAiMessageId 
                ? { ...msg, content: accumulatedContent }
                : msg
            ));
          },
          onComplete: () => {
            console.log('[AIChatPanel] ✅ AI 响应完成');
            setIsLoading(false);
          },
          onError: (error: string) => {
            console.error('[AIChatPanel] ❌ AI 响应失败:', error);
            // 更新消息为错误内容
            setMessages(prev => prev.map(msg => 
              msg.id === tempAiMessageId 
                ? { ...msg, content: `抱歉，发生了错误：${error}` }
                : msg
            ));
            setIsLoading(false);
          }
        }
      );
    } catch (error) {
      console.error('[AIChatPanel] ❌ 调用 AI 服务失败:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，调用 AI 服务失败：${String(error)}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return; // 最大化时不允许调整大小
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;
      
      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      
      // 如果宽度小于收缩阈值，自动关闭面板
      if (newWidth < COLLAPSE_THRESHOLD) {
        onClose();
        setIsResizing(false);
        return;
      }
      
      // 限制在最小和最大宽度之间
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onClose]);

  return (
    <div 
      ref={panelRef}
      className={`ai-chat-panel ${isMaximized ? 'maximized' : ''}`} 
      style={!isMaximized ? { 
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`
      } : {}}
    >
      {/* 拖拽手柄 */}
      {!isMaximized && (
        <div
          className={`ai-chat-panel-resize-handle ${isResizing ? 'resizing' : ''}`}
          style={{
            backgroundColor: (isResizing || isHoveringHandle) ? undefined : 'transparent',
            opacity: (isResizing || isHoveringHandle) ? undefined : 0
          }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHoveringHandle(true)}
          onMouseLeave={() => setIsHoveringHandle(false)}
        />
      )}

      {/* 面板标题栏 */}
      <div className="ai-chat-panel-header">
        <div className="ai-chat-panel-header-left">
          <svg fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" />
          </svg>
          <span>聊天</span>
        </div>
        <div className="ai-chat-panel-header-right">
          <button
            onClick={toggleMaximize}
            title={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? (
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M9 9V3H7v2.59L3.91 2.5L2.5 3.91L5.59 7H3v2h6zm12 0V7h-2.59l3.09-3.09l-1.41-1.41L17 5.59V3h-2v6h6zM3 15v2h2.59L2.5 20.09l1.41 1.41L7 18.41V21h2v-6H3zm12 0v6h2v-2.59l3.09 3.09l1.41-1.41L18.41 17H21v-2h-6z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3.75 3a.75.75 0 0 0-.75.75V5.5a.5.5 0 0 1-1 0V3.75C2 2.784 2.784 2 3.75 2H5.5a.5.5 0 0 1 0 1H3.75zM10 2.5a.5.5 0 0 1 .5-.5h1.75c.966 0 1.75.784 1.75 1.75V5.5a.5.5 0 0 1-1 0V3.75a.75.75 0 0 0-.75-.75H10.5a.5.5 0 0 1-.5-.5zM2.5 10a.5.5 0 0 1 .5.5v1.75c0 .414.336.75.75.75H5.5a.5.5 0 0 1 0 1H3.75A1.75 1.75 0 0 1 2 12.25V10.5a.5.5 0 0 1 .5-.5zm11 0a.5.5 0 0 1 .5.5v1.75A1.75 1.75 0 0 1 12.25 14H10.5a.5.5 0 0 1 0-1h1.75a.75.75 0 0 0 .75-.75V10.5a.5.5 0 0 1 .5-.5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            title="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
              <path d="M1 1l10 10M11 1L1 11" strokeWidth="1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 消息列表容器 */}
      <div className={`ai-chat-panel-messages ${isMaximized ? 'centered' : ''}`}>
        <div 
          className={`ai-chat-panel-messages-content ${isMaximized ? 'max-width' : ''}`}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className={`message-bubble ${message.role === 'user' ? 'user' : 'assistant'}`}>
                <div className="message-content">
                  {message.content}
                </div>
                <div className="message-time">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message assistant">
              <div className="message-bubble assistant">
                <div className="message-loading">
                  <div className="message-loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="text">正在思考...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className={`ai-chat-panel-input-container ${isMaximized ? 'centered' : ''}`}>
        <div className={`ai-chat-panel-input-container-inner ${isMaximized ? 'max-width' : ''}`}>
          <div className="chat-input">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
              rows={3}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
