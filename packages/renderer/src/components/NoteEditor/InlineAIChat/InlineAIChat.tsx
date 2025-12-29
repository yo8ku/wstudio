/**
 * CodeMirror 内联 AI 聊天组件
 * 功能：在 CodeMirror 编辑器中提供内联 AI 对话功能
 * 描述：类似 Monaco Editor 的 AIZoneWidget，但适配 CodeMirror
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { Icon } from '../../Icons/Icon';
import { getCachedModels, getModelConfig } from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { isModelEnabled } from '../../../services/ai';
import type { AIRequestParams, StreamCallback, AIResponse } from '../../../types/aiProvider';
import './InlineAIChat.scss';

/** AI 聊天消息类型 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

/** 模型信息类型 */
interface ModelInfo {
  modelId: string;
  configName: string;
  providerId: string;
  displayName?: string;
  capabilities?: {
    thinking?: boolean;
  };
}

/** 内联聊天组件 Props */
interface InlineAIChatProps {
  onClose: () => void;
  onInsert: (text: string) => void;
  initialSelection?: string;
  view: EditorView;
}

/** 内联 AI 聊天 React 组件 */
export const InlineAIChatComponent: React.FC<InlineAIChatProps> = ({
  onClose,
  onInsert,
  initialSelection,
  view,
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('down');
  const [isAtMenuOpen, setIsAtMenuOpen] = useState(false);
  const [isSparklesMenuOpen, setIsSparklesMenuOpen] = useState(false);
  const [isToneSubmenuOpen, setIsToneSubmenuOpen] = useState(false);
  const [currentSelection, setCurrentSelection] = useState(initialSelection || '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modelTriggerRef = useRef<HTMLSpanElement>(null);
  const atTriggerRef = useRef<HTMLSpanElement>(null);
  const sparklesTriggerRef = useRef<HTMLSpanElement>(null);

  /** AI 能力类型 */
  type AIAbilityType = 'polish' | 'expand' | 'shorten' | 'tone';
  /** 语气类型 */
  type ToneType = 'professional' | 'humorous' | 'casual' | 'readable' | 'subtle' | 'academic' | 'trendy' | 'literary';

  // 关闭所有下拉菜单
  const closeAllMenus = useCallback(() => {
    setIsModelDropdownOpen(false);
    setIsAtMenuOpen(false);
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
  }, []);

  // 切换模型菜单
  const toggleModelMenu = useCallback(() => {
    if (!isModelDropdownOpen && modelTriggerRef.current) {
      const rect = modelTriggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = Math.min(availableModels.length * 40 + 8, 208);
      setDropdownDirection(spaceBelow < dropdownHeight ? 'up' : 'down');
    }
    setIsAtMenuOpen(false);
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
    setIsModelDropdownOpen(!isModelDropdownOpen);
  }, [isModelDropdownOpen, availableModels.length]);

  // 切换 @ 菜单
  const toggleAtMenu = useCallback(() => {
    setIsModelDropdownOpen(false);
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
    setIsAtMenuOpen(!isAtMenuOpen);
  }, [isAtMenuOpen]);

  // 切换 sparkles 菜单
  const toggleSparklesMenu = useCallback(() => {
    setIsModelDropdownOpen(false);
    setIsAtMenuOpen(false);
    setIsToneSubmenuOpen(false);
    setIsSparklesMenuOpen(!isSparklesMenuOpen);
  }, [isSparklesMenuOpen]);

  // 点击外部关闭所有菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 检查是否有菜单打开
      const hasOpenMenu = isModelDropdownOpen || isAtMenuOpen || isSparklesMenuOpen;
      if (!hasOpenMenu) return;

      // 检查点击是否在下拉菜单内部
      const isInDropdown = target.closest('.cm-inline-ai-model-dropdown') ||
                          target.closest('.cm-inline-ai-sparkles-dropdown') ||
                          target.closest('.cm-inline-ai-at-dropdown') ||
                          target.closest('.cm-inline-ai-tone-submenu');
      
      // 检查点击是否在触发器上
      const isOnTrigger = target.closest('.cm-inline-ai-model-trigger') ||
                         target.closest('.cm-inline-ai-sparkles-btn') ||
                         target.closest('.cm-inline-ai-at-trigger');

      // 如果点击不在下拉菜单内部且不在触发器上，关闭所有菜单
      if (!isInDropdown && !isOnTrigger) {
        closeAllMenus();
      }
    };

    // 使用 capture 阶段捕获事件，确保在其他事件处理之前执行
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [closeAllMenus, isModelDropdownOpen, isAtMenuOpen, isSparklesMenuOpen]);

  // 加载可用模型
  useEffect(() => {
    const loadModels = async () => {
      try {
        const cachedModels = await getCachedModels();
        const modelInfos: ModelInfo[] = cachedModels
          .filter(model => {
            const modelName = model.modelId.includes(':') 
              ? model.modelId.split(':')[1] 
              : model.modelId;
            return isModelEnabled(modelName);
          })
          .map(model => ({
            modelId: model.modelId,
            configName: model.configName,
            providerId: model.providerId,
            displayName: model.displayName,
            capabilities: model.capabilities,
          }));
        
        setAvailableModels(modelInfos);
        if (modelInfos.length > 0 && !selectedModel) {
          setSelectedModel(modelInfos[0].modelId);
        }
      } catch (error) {
        console.error('[InlineAIChat] 加载模型失败:', error);
      }
    };
    loadModels();
  }, [selectedModel]);

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自动调整输入框高度
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 150);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  // 监听编辑器选择变化
  useEffect(() => {
    const updateSelection = () => {
      const { from, to } = view.state.selection.main;
      if (from < to) {
        const text = view.state.sliceDoc(from, to);
        setCurrentSelection(text);
      } else {
        setCurrentSelection('');
      }
    };

    // 使用 DOM 事件监听选择变化
    view.contentDOM.addEventListener('mouseup', updateSelection);
    view.contentDOM.addEventListener('keyup', updateSelection);

    return () => {
      view.contentDOM.removeEventListener('mouseup', updateSelection);
      view.contentDOM.removeEventListener('keyup', updateSelection);
    };
  }, [view]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || !selectedModel) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 创建助手消息占位
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const modelConfig = await getModelConfig(selectedModel);
      if (!modelConfig) {
        throw new Error(`未找到模型配置：${selectedModel}`);
      }

      // 从 modelId 中提取实际的模型名称（格式：configName:modelName）
      const actualModelName = modelConfig.modelId.includes(':') 
        ? modelConfig.modelId.split(':')[1] 
        : modelConfig.modelId;

      // 设置 AI 提供商
      await aiService.setProvider(modelConfig.providerId, {
        name: modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        modelId: actualModelName,
      });

      // 构建消息历史
      const chatMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      
      // 添加当前用户消息
      chatMessages.push({
        role: 'user' as const,
        content: currentSelection 
          ? `以下是选中的文本：\n\n${currentSelection}\n\n用户问题：${userMessage.content}`
          : userMessage.content,
      });

      // 创建 AbortController
      abortControllerRef.current = new AbortController();

      // 构建请求参数
      const requestParams: AIRequestParams = {
        model: actualModelName,
        messages: chatMessages,
        signal: abortControllerRef.current.signal,
      };

      // 流式回调
      let fullResponse = '';
      const streamCallback: StreamCallback = {
        onContent: (content: string) => {
          fullResponse += content;
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: fullResponse }
                : msg
            )
          );
        },
        onComplete: (_response: AIResponse) => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, isStreaming: false }
                : msg
            )
          );
          setIsLoading(false);
        },
        onError: (error: Error) => {
          console.error('[InlineAIChat] AI 响应错误:', error);
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: `错误: ${error.message}`, isStreaming: false }
                : msg
            )
          );
          setIsLoading(false);
        },
      };

      // 调用流式 API
      await aiService.generateTextStream(requestParams, streamCallback);
    } catch (error) {
      console.error('[InlineAIChat] 发送消息失败:', error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: `错误: ${(error as Error).message}`, isStreaming: false }
            : msg
        )
      );
      setIsLoading(false);
    }
  }, [input, isLoading, selectedModel, messages, initialSelection]);

  // 停止生成
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setMessages(prev => 
      prev.map(msg => 
        msg.isStreaming ? { ...msg, isStreaming: false } : msg
      )
    );
  }, []);

  // 插入最后一条助手消息到编辑器
  const handleInsertLastResponse = useCallback(() => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMessage) {
      onInsert(lastAssistantMessage.content);
    }
  }, [messages, onInsert]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSend, onClose]);

  // 获取模型显示名称
  const getModelDisplayName = (modelId: string): string => {
    const model = availableModels.find(m => m.modelId === modelId);
    if (model?.displayName) return model.displayName;
    const colonIndex = modelId.indexOf(':');
    return colonIndex > 0 ? modelId.substring(colonIndex + 1) : modelId;
  };

  // @ 菜单项点击处理
  const handleAtMenuClick = useCallback((type: 'file' | 'folder' | 'knowledge') => {
    setIsAtMenuOpen(false);
    // TODO: 根据类型打开对应的选择器
    console.log('[InlineAIChat] @ 菜单选择:', type);
  }, []);

  // AI 能力菜单点击处理
  const handleAIAbilityClick = useCallback((ability: AIAbilityType, tone?: ToneType) => {
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
    
    if (!currentSelection) {
      // 没有选中文本时提示
      setInput('请先选中需要处理的文本');
      return;
    }

    let prompt = '';
    switch (ability) {
      case 'polish':
        prompt = `请润色以下文本，使其更加流畅、优美，保持原意不变：\n\n${currentSelection}`;
        break;
      case 'expand':
        prompt = `请扩写以下文本，增加更多细节和内容，使其更加丰富：\n\n${currentSelection}`;
        break;
      case 'shorten':
        prompt = `请缩短以下文本，保留核心内容，使其更加简洁：\n\n${currentSelection}`;
        break;
      case 'tone':
        if (tone) {
          const toneMap: Record<ToneType, string> = {
            professional: '更专业',
            humorous: '更幽默',
            casual: '更口语化',
            readable: '更易读',
            subtle: '更含蓄',
            academic: '更学术',
            trendy: '更网感',
            literary: '更有文采',
          };
          prompt = `请将以下文本改写为${toneMap[tone]}的语气，保持原意不变：\n\n${currentSelection}`;
        }
        break;
    }

    if (prompt) {
      setInput(prompt);
      // 自动发送
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [currentSelection]);

  return (
    <div className="cm-inline-ai-chat">
      {/* 头部工具栏 */}
      <div className="cm-inline-ai-header">
        <div className="cm-inline-ai-header-left">
          <span className="cm-inline-ai-title">AI 助手</span>
          {currentSelection && (
            <span className="cm-inline-ai-selection-badge" title="已选中文本">
              已选中
            </span>
          )}
        </div>
        <div className="cm-inline-ai-header-right">
          <div className="cm-inline-ai-sparkles-menu">
            <span
              ref={sparklesTriggerRef}
              className="cm-inline-ai-sparkles-btn"
              onClick={toggleSparklesMenu}
              title="AI 能力"
            >
              <Icon name="sparkles" size={14} />
            </span>
            {isSparklesMenuOpen && (
              <div className="cm-inline-ai-sparkles-dropdown">
                <div
                  className="cm-inline-ai-sparkles-option"
                  onClick={() => handleAIAbilityClick('polish')}
                >
                  润色
                </div>
                <div
                  className="cm-inline-ai-sparkles-option"
                  onClick={() => handleAIAbilityClick('expand')}
                >
                  扩写
                </div>
                <div
                  className="cm-inline-ai-sparkles-option"
                  onClick={() => handleAIAbilityClick('shorten')}
                >
                  缩短
                </div>
                <div
                  className="cm-inline-ai-sparkles-option cm-inline-ai-sparkles-option-submenu"
                  onMouseEnter={() => setIsToneSubmenuOpen(true)}
                  onMouseLeave={() => setIsToneSubmenuOpen(false)}
                >
                  <span>更改语气</span>
                  <Icon name="chevron-right" size={12} />
                  {isToneSubmenuOpen && (
                    <div className="cm-inline-ai-tone-submenu">
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'professional')}
                      >
                        更专业
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'humorous')}
                      >
                        更幽默
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'casual')}
                      >
                        更口语化
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'readable')}
                      >
                        更易读
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'subtle')}
                      >
                        更含蓄
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'academic')}
                      >
                        更学术
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'trendy')}
                      >
                        更网感
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'literary')}
                      >
                        更有文采
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="cm-inline-ai-at-menu">
            <span
              ref={atTriggerRef}
              className="cm-inline-ai-at-trigger"
              onClick={toggleAtMenu}
              title="添加上下文"
            >
              @
            </span>
            {isAtMenuOpen && (
              <div className="cm-inline-ai-at-dropdown">
                <div
                  className="cm-inline-ai-at-option"
                  onClick={() => handleAtMenuClick('file')}
                >
                  <Icon name="file" size={14} />
                  <span>文件</span>
                </div>
                <div
                  className="cm-inline-ai-at-option"
                  onClick={() => handleAtMenuClick('folder')}
                >
                  <Icon name="folder" size={14} />
                  <span>文件夹</span>
                </div>
                <div
                  className="cm-inline-ai-at-option"
                  onClick={() => handleAtMenuClick('knowledge')}
                >
                  <Icon name="database" size={14} />
                  <span>知识库</span>
                </div>
              </div>
            )}
          </div>
          <span 
            className="cm-inline-ai-close"
            onClick={onClose}
            title="关闭 (Esc)"
          >
            <Icon name="close" size={14} />
          </span>
        </div>
      </div>

      {/* 消息列表 */}
      {messages.length > 0 && (
        <div className="cm-inline-ai-messages">
          {messages.map(msg => (
            <div 
              key={msg.id} 
              className={`cm-inline-ai-message cm-inline-ai-message-${msg.role}`}
            >
              <div className="cm-inline-ai-message-content">
                {msg.content || (msg.isStreaming ? '思考中...' : '')}
                {msg.isStreaming && <span className="cm-inline-ai-cursor" />}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 输入区域 */}
      <div className="cm-inline-ai-input-area">
        <textarea
          ref={inputRef}
          className="cm-inline-ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="向 AI 描述您想要做什么..."
          rows={1}
          disabled={isLoading}
        />
        
        {/* 底部工具栏 */}
        <div className="cm-inline-ai-toolbar">
          {/* 模型选择 */}
          <div className="cm-inline-ai-model-select">
            <span 
              ref={modelTriggerRef}
              className="cm-inline-ai-model-trigger"
              onClick={toggleModelMenu}
            >
              {getModelDisplayName(selectedModel)}
              <Icon name="chevron-down" size={12} />
            </span>
            {isModelDropdownOpen && (
              <div className={`cm-inline-ai-model-dropdown cm-inline-ai-model-dropdown-${dropdownDirection}`}>
                {availableModels.map(model => (
                  <div
                    key={model.modelId}
                    className={`cm-inline-ai-model-option ${model.modelId === selectedModel ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.modelId);
                      setIsModelDropdownOpen(false);
                    }}
                  >
                    <span className="cm-inline-ai-model-name">
                      {model.displayName || model.modelId.split(':')[1]}
                    </span>
                    {model.capabilities?.thinking && (
                      <span className="cm-inline-ai-model-badge">Thinking</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="cm-inline-ai-actions">
            {messages.some(m => m.role === 'assistant' && !m.isStreaming) && (
              <span 
                className="cm-inline-ai-btn"
                onClick={handleInsertLastResponse}
                title="插入到编辑器"
              >
                <Icon name="check" size={14} />
                插入
              </span>
            )}
            {isLoading ? (
              <span 
                className="cm-inline-ai-btn cm-inline-ai-btn-stop"
                onClick={handleStop}
                title="停止生成"
              >
                <Icon name="close" size={14} />
                停止
              </span>
            ) : (
              <span 
                className={`cm-inline-ai-btn cm-inline-ai-btn-send ${!input.trim() || !selectedModel ? 'disabled' : ''}`}
                onClick={handleSend}
                title="发送 (Enter)"
              >
                <Icon name="play" size={14} />
                发送
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
